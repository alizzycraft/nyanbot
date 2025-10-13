import { Global, Module } from '@nestjs/common';
import { SwarmService } from './swarm.service';

@Global()
@Module({
  providers: [SwarmService],
  exports: [SwarmService],
})
export class SwarmModule {}
