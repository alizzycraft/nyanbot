import { Command } from '../../swarm/interfaces/command.interface';

export const REACTION_ROLE_COMMAND_ASSIGN_ROLE = 'reactionRole:assignRole';
export const REACTION_ROLE_COMMAND_REMOVE_ROLE = 'reactionRole:removeRole';
export const REACTION_ROLE_COMMAND_UPDATE_NICKNAME =
  'reactionRole:updateNickname';

// --- Commands ---

export interface ReactionRoleAssignRoleCommandPayload {
  userId: string;
  roleId: string;
  guildId: string;
}

export type ReactionRoleAssignRoleCommand =
  Command<ReactionRoleAssignRoleCommandPayload>;
export const isReactionRoleAssignRoleCommand = (
  command: Command,
): command is ReactionRoleAssignRoleCommand =>
  command.type === REACTION_ROLE_COMMAND_ASSIGN_ROLE;

export interface ReactionRoleRemoveRoleCommandPayload {
  userId: string;
  roleId: string;
  guildId: string;
}

export type ReactionRoleRemoveRoleCommand =
  Command<ReactionRoleRemoveRoleCommandPayload>;
export const isReactionRoleRemoveRoleCommand = (
  command: Command,
): command is ReactionRoleRemoveRoleCommand =>
  command.type === REACTION_ROLE_COMMAND_REMOVE_ROLE;

export interface ReactionRoleUpdateNicknameCommandPayload {
  userId: string;
  partType: 'pronoun' | 'politics';
  value?: string;
  guildId: string;
}

export type ReactionRoleUpdateNicknameCommand =
  Command<ReactionRoleUpdateNicknameCommandPayload>;
export const isReactionRoleUpdateNicknameCommand = (
  command: Command,
): command is ReactionRoleUpdateNicknameCommand =>
  command.type === REACTION_ROLE_COMMAND_UPDATE_NICKNAME;
