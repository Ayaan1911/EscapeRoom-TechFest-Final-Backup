export type TeamInput = { id: string; name: string; participants: string[] };
export type PlannedTeam = TeamInput & { variant: "A" | "B" | "C" };
export const VARIANTS: string[];
export function generateCode(rand?: (max: number) => number): string;
export function parseCsv(text: string): string[][];
export function teamsFromCsv(text: string): TeamInput[];
export function generatedTeams(count: number): TeamInput[];
export function planTeams(requested: TeamInput[], existing: { id: string; variant: string }[], prefix?: string): PlannedTeam[];
export function csvField(value: unknown): string;
