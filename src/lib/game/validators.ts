import type { ChapterValidator } from "./engine";
import "server-only";
import { inboxValidator } from "./inbox.server";

export const validators: Partial<Record<number, ChapterValidator>> = { 0: inboxValidator };
