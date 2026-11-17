export const ADMIN_URL: string;
export function applyMigrations(url: string): Promise<void>;
export function createTempDatabase(label?: string): Promise<{ name: string; url: string; drop(): Promise<void> }>;
export function dropStaleTempDatabases(): Promise<number>;
