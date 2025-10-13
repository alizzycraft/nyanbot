import { Module } from '@nestjs/common';
import { PersistenceNanite } from './persistence.nanite';
import { SwarmModule } from '../../swarm/swarm.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [SwarmModule, DatabaseModule],
  providers: [PersistenceNanite],
})
export class PersistenceNaniteModule {}
