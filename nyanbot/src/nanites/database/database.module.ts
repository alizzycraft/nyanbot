import { Module } from '@nestjs/common';
import { DatabaseNanite } from './database.nanite';
import { SwarmModule } from '../../swarm/swarm.module';

@Module({
  imports: [SwarmModule],
  providers: [DatabaseNanite],
  exports: [DatabaseNanite],
})
export class DatabaseNaniteModule {}