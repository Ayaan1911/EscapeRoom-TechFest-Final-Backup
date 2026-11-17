import type { ChapterValidator } from "./engine";
import "server-only";
import { inboxValidator } from "./inbox.server";
import { trailValidator } from "./trail.server";
import { insiderValidator } from "./insider.server";
import { containmentValidator } from "./containment.server";

export const validators: Partial<Record<number, ChapterValidator>> = { 0: inboxValidator, 1: trailValidator, 2: insiderValidator, 3: containmentValidator };
