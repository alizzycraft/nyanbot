import { Command } from '../../swarm/interfaces/command.interface';
import { Message, MessageReaction, User } from 'discord.js';

export const DISCORD_NANITE_COMMAND_SEND_MESSAGE = 'discord:sendMessage';
export const DISCORD_NANITE_COMMAND_SET_NICKNAME = 'discord:setNickname';
export const DISCORD_NANITE_EVENT_MESSAGE_CREATE = 'discord:messageCreate';
export const DISCORD_NANITE_EVENT_MESSAGE_REACTION_ADD =
  'discord:messageReactionAdd';

// --- Commands ---

export interface DiscordSendMessageCommandPayload {
  channelId: string;
  message: string;
}
export type DiscordSendMessageCommand =
  Command<DiscordSendMessageCommandPayload>;
export const isDiscordSendMessageCommand = (
  command: Command,
): command is DiscordSendMessageCommand =>
  command.type === DISCORD_NANITE_COMMAND_SEND_MESSAGE;

export interface DiscordSetNicknameCommandPayload {
  userId: string;
  guildId: string;
  nickname: string;
}
export type DiscordSetNicknameCommand =
  Command<DiscordSetNicknameCommandPayload>;
export const isDiscordSetNicknameCommand = (
  command: Command,
): command is DiscordSetNicknameCommand =>
  command.type === DISCORD_NANITE_COMMAND_SET_NICKNAME;

// --- Events dispatched as commands ---

export type DiscordMessageCreateCommand = Command<Message>;
export const isDiscordMessageCreateCommand = (
  command: Command,
): command is DiscordMessageCreateCommand =>
  command.type === DISCORD_NANITE_EVENT_MESSAGE_CREATE;

export type DiscordMessageReactionAddCommand = Command<{
  reaction: MessageReaction;
  user: User;
}>;
export const isDiscordMessageReactionAddCommand = (
  command: Command,
): command is DiscordMessageReactionAddCommand =>
  command.type === DISCORD_NANITE_EVENT_MESSAGE_REACTION_ADD;
