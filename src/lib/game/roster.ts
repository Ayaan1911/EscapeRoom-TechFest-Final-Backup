import type { Prisma } from "@prisma/client";

/** Who competes. A team WITHOUT a TeamProvision row (demo, test and earlier teams) is an ordinary competitor. In the provisioned final roster, a reserve that has not been
 *  activated and a primary that was replaced by a reserve are NOT competitors: they never appear in rankings, qualification, the projector or the Insider group counts. */
export const competitorWhere = { NOT: { provision: { is: { OR: [{ kind: "reserve", activatedAt: null }, { withdrawnAt: { not: null } }] } } } } satisfies Prisma.TeamWhereInput;

export type StandbyKind = "reserve" | "replaced";
/** null = competes normally. */
export function standbyOf(p: { kind: string; activatedAt: Date | null; withdrawnAt: Date | null } | null | undefined): StandbyKind | null {
  if (!p) return null;
  if (p.withdrawnAt) return "replaced";
  if (p.kind === "reserve" && !p.activatedAt) return "reserve";
  return null;
}
