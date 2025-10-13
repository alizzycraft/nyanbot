import { Module } from '@nestjs/common';
import { PersistenceNanite } from './persistence.nanite';
import { SwarmModule } from '../../swarm/swarm.module';
import { DatabaseNaniteModule } from '../database/database.module';

@Module({
  imports: [SwarmModule, DatabaseNaniteModule],
  providers: [PersistenceNanite],
})
export class PersistenceNaniteModule {}
