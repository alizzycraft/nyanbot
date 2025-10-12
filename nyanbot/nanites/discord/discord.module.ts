import { Module } from '@nestjs/common';
import { DiscordNanite } from './discord.nanite';
import { ConfigModule } from '@nestjs/config';
import { SwarmModule } from '../../swarm/swarm.module';

@Module({
  imports: [ConfigModule, SwarmModule],
  providers: [DiscordNanite],
  exports: [DiscordNanite],
})
export class DiscordNaniteModule {}
