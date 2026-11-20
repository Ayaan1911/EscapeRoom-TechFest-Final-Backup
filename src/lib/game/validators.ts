import type { ChapterValidator } from "./engine";
import "server-only";
import { inboxValidator, inboxTasks } from "./inbox.server";
import { trailValidator, trailTasks } from "./trail.server";
import { insiderValidator, insiderTasks } from "./insider.server";
import { containmentValidator, containmentTasks } from "./containment.server";
import { verdictValidator, verdictTasks } from "./verdict.server";

export const validators: Partial<Record<number, ChapterValidator>> = { 0: inboxValidator, 1: trailValidator, 2: insiderValidator, 3: containmentValidator, 4: verdictValidator };
export const taskDefs: readonly Record<string, import("./scoring").TaskDef>[] = [inboxTasks, trailTasks, insiderTasks, containmentTasks, verdictTasks];
