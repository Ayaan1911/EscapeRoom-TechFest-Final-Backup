import type { ChapterValidator } from "./engine";

// Server-only registry: Phase 2 supplies trusted validators, hints and evidence.
export const validators: Partial<Record<number, ChapterValidator>> = {};
