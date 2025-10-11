import { registerAs } from '@nestjs/config';

export const channelConfig = registerAs('channels', () => ({
  admin: process.env.ADMIN_CHANNEL_ID,
  roles: process.env.ROLES_CHANNEL_ID,
}));

export type ChannelConfig = ReturnType<typeof channelConfig>;