import { Module } from '@nestjs/common';
import { LoggerNanite } from './logger.nanite';
import { SwarmModule } from '../../swarm/swarm.module';

@Module({
  imports: [SwarmModule],
  providers: [LoggerNanite],
})
export class LoggerNaniteModule {}