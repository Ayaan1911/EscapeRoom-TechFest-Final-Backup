import type { ChapterValidator } from "./engine";
import "server-only";
import { inboxValidator } from "./inbox.server";
import { trailValidator } from "./trail.server";

export const validators: Partial<Record<number, ChapterValidator>> = { 0: inboxValidator, 1: trailValidator };
