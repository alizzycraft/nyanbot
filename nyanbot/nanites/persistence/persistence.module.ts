import { Module } from '@nestjs/common';
import { PersistenceNanite } from './persistence.nanite';
import { SwarmModule } from '../../swarm/swarm.module';

@Module({
  imports: [SwarmModule],
  providers: [PersistenceNanite],
})
export class PersistenceNaniteModule {}