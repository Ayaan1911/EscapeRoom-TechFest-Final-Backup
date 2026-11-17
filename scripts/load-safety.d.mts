import type { PrismaClient } from "@prisma/client";
type Db = PrismaClient | Record<string, unknown>;
export const TEST_MARK: string;
export function redact(text: unknown, secrets?: unknown[]): string;
export function databaseName(url: string): string;
export function assertRemoteTarget(o: { origin: string; databaseUrl?: string; adminCode?: string; argv?: string[]; env?: Record<string, string | undefined> }): { database: string; host: string };
export function assertEmpty(db: Db): Promise<void>;
export class Scope { teamIds: Set<string>; adminTokens: Set<string>; round: { original: unknown; last: { startsAt: Date; deadline: Date } | null } | null; addTeam(id: string): void }
export function writeRound(db: Db, scope: Scope, v: { startsAt: Date; deadline: Date }): Promise<void>;
export function cleanup(db: Db, scope: Scope): Promise<{ ok: boolean; failed: string[] }>;
