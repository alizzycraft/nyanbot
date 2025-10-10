import { registerAs } from '@nestjs/config';

export const channelConfig = registerAs('channels', () => ({
  admin: process.env.DISCORD_ADMIN_CHANNEL_ID,
  roles: process.env.DISCORD_ROLES_CHANNEL_ID,
}));

export type ChannelConfig = ReturnType<typeof channelConfig>;
