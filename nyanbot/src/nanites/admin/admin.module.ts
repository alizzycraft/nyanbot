import { Module } from '@nestjs/common';
import { AdminNanite } from './admin.nanite';
import { channelConfig } from '../discord/channel.config';
import { SwarmModule } from '../../swarm/swarm.module';
import { ConfigModule } from '@nestjs/config';
import { DiscordNaniteModule } from '../discord/discord.module';
import { ReactionRoleColonyModule } from '../../colonies/reaction-role/reaction-role.module';

@Module({
  imports: [
    SwarmModule,
    DiscordNaniteModule,
    ConfigModule.forFeature(channelConfig),
    ReactionRoleColonyModule,
  ],
  providers: [AdminNanite],
})
export class AdminNaniteModule {}