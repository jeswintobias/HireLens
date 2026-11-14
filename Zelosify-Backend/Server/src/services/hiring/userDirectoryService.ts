import prisma from "../../config/prisma/prisma.js";

/**
 * Resolves user ids to display names, scoped to one tenant.
 * Opening.hiringManagerId is a plain id (no Prisma relation), so names are
 * looked up in one batched query per request instead of per row.
 */
export async function getDisplayNames(
  tenantId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();

  const users = await prisma.user.findMany({
    where: { id: { in: unique }, tenantId },
    select: { id: true, firstName: true, lastName: true, username: true },
  });

  return new Map(
    users.map((u) => {
      const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ");
      return [u.id, fullName || u.username || "Unknown"];
    })
  );
}

export function displayNameOf(names: Map<string, string>, id: string) {
  return names.get(id) ?? "Unknown";
}
