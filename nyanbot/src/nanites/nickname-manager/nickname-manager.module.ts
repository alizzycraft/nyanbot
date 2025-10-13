import { Module } from '@nestjs/common';
import { NicknameManagerNanite } from './nickname-manager.nanite';
import { SwarmModule } from '../../swarm/swarm.module';

@Module({
  imports: [SwarmModule],
  providers: [NicknameManagerNanite],
  exports: [NicknameManagerNanite],
})
export class NicknameManagerModule {}