import { registerAs } from '@nestjs/config';

export const channelConfig = registerAs('channels', () => ({
  admin: process.env.ADMIN_CHANNEL_ID,
  roles: process.env.ROLES_CHANNEL_ID,
  // Allow restricting to specific guilds (comma-separated list)
  allowedGuilds: process.env.ALLOWED_GUILD_IDS ? process.env.ALLOWED_GUILD_IDS.split(',') : undefined,
  // Guild-specific channel mappings
  guildChannels: process.env.GUILD_CHANNELS ? JSON.parse(process.env.GUILD_CHANNELS) : {},
}));

export type ChannelConfig = ReturnType<typeof channelConfig>;