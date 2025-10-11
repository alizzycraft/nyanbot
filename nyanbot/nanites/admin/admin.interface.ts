import { Command } from '../../swarm/interfaces/command.interface';

export const ADMIN_COMMAND_POST_ROLES = 'admin:postRoles';

// --- Commands ---

export interface AdminPostRolesCommandPayload {
  guildId: string;
}
export type AdminPostRolesCommand = Command<AdminPostRolesCommandPayload>;
export const isAdminPostRolesCommand = (
  command: Command,
): command is AdminPostRolesCommand =>
  command.type === ADMIN_COMMAND_POST_ROLES;
