import { randomUUID } from "crypto";
import prisma from "../../src/config/prisma/prisma";

/**
 * Creates an isolated data set (2 tenants, their users and openings) in the
 * test database, and removes everything it created afterwards. Rows are
 * scoped by the generated tenant ids, so existing seed data is never touched.
 */
export interface TestUser {
  id: string;
  externalId: string;
  role: "IT_VENDOR" | "HIRING_MANAGER";
  tenantId: string;
}

export async function createTenantFixture(label: string) {
  const tenantA = await prisma.tenants.create({ data: { companyName: `test-${label}-A` } });
  const tenantB = await prisma.tenants.create({ data: { companyName: `test-${label}-B` } });

  const user = async (role: TestUser["role"], tenantId: string, name: string): Promise<TestUser> => {
    const externalId = randomUUID();
    const u = await prisma.user.create({
      data: {
        username: `test-${label}-${name}-${externalId.slice(0, 8)}`,
        email: `${name}-${externalId.slice(0, 8)}@example.test`,
        firstName: name,
        role,
        tenantId,
        externalId,
        profileComplete: true,
      },
    });
    return { id: u.id, externalId, role, tenantId };
  };

  const vendorA = await user("IT_VENDOR", tenantA.tenantId, "vendorA");
  const vendorA2 = await user("IT_VENDOR", tenantA.tenantId, "vendorA2");
  const managerA = await user("HIRING_MANAGER", tenantA.tenantId, "managerA");
  const managerA2 = await user("HIRING_MANAGER", tenantA.tenantId, "managerA2");
  const vendorB = await user("IT_VENDOR", tenantB.tenantId, "vendorB");
  const managerB = await user("HIRING_MANAGER", tenantB.tenantId, "managerB");

  const opening = (tenantId: string, hiringManagerId: string, extra: Record<string, unknown> = {}) =>
    prisma.opening.create({
      data: {
        tenantId,
        hiringManagerId,
        title: "Senior Node.js Engineer",
        description: "Build APIs.\nRequired skills: Node.js, TypeScript, PostgreSQL, Docker",
        location: "Bangalore",
        contractType: "Contract",
        experienceMin: 3,
        experienceMax: 6,
        status: "OPEN",
        ...extra,
      },
    });

  const openingA = await opening(tenantA.tenantId, managerA.id);
  const openingA2 = await opening(tenantA.tenantId, managerA2.id, { title: "Other manager's opening" });
  const closedA = await opening(tenantA.tenantId, managerA.id, { title: "Closed opening", status: "CLOSED" });
  const openingB = await opening(tenantB.tenantId, managerB.id, { title: "Tenant B opening" });

  const tenantIds = [tenantA.tenantId, tenantB.tenantId];

  async function cleanup() {
    const where = { opening: { tenantId: { in: tenantIds } } };
    await prisma.recommendationRun.deleteMany({ where: { profile: where } });
    await prisma.hiringProfile.deleteMany({ where });
    await prisma.opening.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenants.deleteMany({ where: { tenantId: { in: tenantIds } } });
  }

  return {
    tenantA, tenantB,
    users: { vendorA, vendorA2, managerA, managerA2, vendorB, managerB },
    openings: { openingA, openingA2, closedA, openingB },
    cleanup,
  };
}
