import { Request, Response } from "express";
import asyncHandler from "../../../../utils/handler/asyncHandler.js";
import { RegisterRequest, RegisterResponse } from "../../../../types/auth.js";
import prisma from "../../../../config/prisma/prisma.js";
import QRCode from "qrcode";
import { getAdminToken } from "../../../../utils/keycloak/getAdminToken.js";
import { authenticator } from "otplib";
import { createKeycloakUser } from "../../../../utils/keycloak/createKeycloakUser.js";
import axios from "axios";
import { AuthProvider, Role } from "@prisma/client";
import { isValidRole } from "../../../../utils/RBAC/isValidRole.js";
import {
  REGISTRATION_KEY_HEADER,
  checkRegistrationRole,
} from "../../../../helpers/auth/registrationPolicy.js";

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || "http://localhost:8080/auth";
const REALM_NAME = process.env.KEYCLOAK_REALM || "Zelosify";

/**
 * Register a new user with TOTP 2FA setup
 * @param req - Express request with RegisterRequest body
 * @param res - Express response with success or error data
 */
export const register = asyncHandler(
  async (req: Request<{}, any, RegisterRequest>, res: Response) => {
    try {
      const {
        username,
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        tenantId,
        department,
        role,
      } = req.body;

      if (
        !username ||
        !email ||
        !password ||
        !firstName ||
        !lastName ||
        !phoneNumber ||
        !tenantId ||
        !department ||
        !role
      ) {
        res.status(400).json({ error: "All fields are required." });
        return;
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { OR: [{ username }, { email }] },
      });
      if (existingUser) {
        res.status(400).json({ message: "User already exists." });
        return;
      }

      // Verify that the tenantId exists in the database
      const tenant = await prisma.tenants.findUnique({
        where: { tenantId },
      });
      if (!tenant) {
        res.status(400).json({ message: "Invalid tenant ID." });
        return;
      }

      // Validate the provided role
      if (!isValidRole(role)) {
        res.status(400).json({ message: "Invalid role provided." });
        return;
      }

      // Privileged roles cannot be self-assigned (see registrationPolicy.ts).
      const decision = checkRegistrationRole(
        role,
        req.get(REGISTRATION_KEY_HEADER) ?? undefined
      );
      if (!decision.allowed) {
        res.status(decision.status).json({ message: decision.message });
        return;
      }

      // Get an admin token from Keycloak
      const adminToken = await getAdminToken();

      // Generate a TOTP secret for 2FA
      const totpSecret = authenticator.generateSecret();

      // Create the user in Keycloak (409 = username/email already exists there)
      let keycloakUser: { id?: string };
      try {
        keycloakUser = await createKeycloakUser(adminToken, {
          username,
          email,
          firstName: firstName || username,
          lastName: lastName || "",
          enabled: true,
          credentials: [{ type: "password", value: password, temporary: false }],
        });
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 409) {
          res.status(400).json({ message: "User already exists." });
          return;
        }
        throw error;
      }

      if (!keycloakUser.id) {
        res.status(500).json({ message: "Failed to create user in Keycloak" });
        return;
      }

      // From here on every step must succeed (role assignment included: a
      // user without a role cannot use the app). On any failure the Keycloak
      // user is deleted again, so no half-created account is left behind.
      const adminHeaders = { headers: { Authorization: `Bearer ${adminToken}` } };
      let user;
      try {
        const roleResponse = await axios.get(
          `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/roles/${role}`,
          adminHeaders
        );
        if (!roleResponse.data?.id) {
          throw new Error(`Role "${role}" not found in Keycloak`);
        }
        await axios.post(
          `${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${keycloakUser.id}/role-mappings/realm`,
          [roleResponse.data],
          adminHeaders
        );

        user = await prisma.user.create({
          data: {
            username,
            email,
            firstName,
            lastName,
            phoneNumber,
            department,
            role: role as Role,
            tenantId,
            externalId: keycloakUser.id,
            totpSecret,
            provider: AuthProvider.KEYCLOAK,
            creator: username,
          },
          select: {
            id: true,
            username: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            department: true,
            role: true,
            tenantId: true,
            provider: true,
          },
        });
      } catch (error) {
        console.error("Registration failed after Keycloak user creation; rolling back:", error);
        await axios
          .delete(`${KEYCLOAK_URL}/admin/realms/${REALM_NAME}/users/${keycloakUser.id}`, adminHeaders)
          .catch((e) =>
            console.error(`Could not remove partially created Keycloak user ${keycloakUser.id}:`, e?.message)
          );
        res.status(500).json({ message: "Registration could not be completed. Please try again." });
        return;
      }

      // No session is issued here: the first sign-in goes through password +
      // TOTP like every other, which also proves the authenticator was set up.
      // (Issuing cookies at sign-up skipped 2FA and let users skip enrolment.)

      // Generate QR code for TOTP
      const otpAuthUrl = authenticator.keyuri(email, REALM_NAME, totpSecret);
      const qrCode = await QRCode.toDataURL(otpAuthUrl);

      // Return registration response with proper typing
      const response: RegisterResponse = {
        message:
          "User registered successfully. Scan the QR Code to configure TOTP.",
        user: {
          id: user.id,
          username: user.username || "",
          email: user.email,
          firstName: user.firstName || "",
          lastName: user.lastName || "",
          phoneNumber: user.phoneNumber || "",
          department: user.department || "",
          role: user.role,
          tenantId: user.tenantId || "",
          provider: user.provider,
        },
        qrCode,
        otpAuthUrl,
        expiresIn: 3600, // 1 hour in seconds
      };

      res.status(201).json(response);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Error registering user" });
    }
  }
);
