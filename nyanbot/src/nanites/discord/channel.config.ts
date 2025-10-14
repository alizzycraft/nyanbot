import { registerAs } from '@nestjs/config';

export const channelConfig = registerAs('channels', () => ({
  // These will be overridden by database values when available
  admin: process.env.ADMIN_CHANNEL_ID,
  roles: process.env.ROLES_CHANNEL_ID,
  // Allow restricting to specific guilds (comma-separated list)
  allowedGuilds: process.env.ALLOWED_GUILD_IDS ? process.env.ALLOWED_GUILD_IDS.split(',') : undefined,
  // Guild-specific channel mappings
  guildChannels: process.env.GUILD_CHANNELS ? JSON.parse(process.env.GUILD_CHANNELS) : {},
}));

export type ChannelConfig = ReturnType<typeof channelConfig>;