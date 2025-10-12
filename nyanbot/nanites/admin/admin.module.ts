import { Module } from '@nestjs/common';
import { AdminNanite } from './admin.nanite';
import { channelConfig } from '../../discord/channel.config';
import { roleMessageConfigs } from '../../role-message/role-message.config';
import { SwarmModule } from '../../swarm/swarm.module';
import { ConfigModule } from '@nestjs/config';
import { RoleMessageModule } from '../../role-message/role-message.module';
import { DiscordNaniteModule } from '../discord/discord.module';

@Module({
  imports: [
    SwarmModule,
    RoleMessageModule,
    DiscordNaniteModule,
    ConfigModule.forFeature(channelConfig),
  ],
  providers: [
    AdminNanite,
    {
      provide: 'ROLE_MESSAGE_CONFIGS',
      useValue: roleMessageConfigs,
    },
  ],
})
export class AdminNaniteModule {}
