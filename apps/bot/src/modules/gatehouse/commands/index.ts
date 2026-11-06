import type { ButtonHandler, Command } from "../../../commands/types.js";
import { lockdown } from "./lockdown.js";
import { restoreButton } from "./restore.js";
import { security } from "./security.js";
import { verify, verifyButton } from "./verify.js";

export const gatehouseCommands: Command[] = [lockdown, verify, security];
export const gatehouseButtons: ButtonHandler[] = [verifyButton, restoreButton];
