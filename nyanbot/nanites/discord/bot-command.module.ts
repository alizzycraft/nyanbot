import { Module } from '@nestjs/common';
import { NicknameStateService } from './nickname-state.service';
import { ConfigModule } from '@nestjs/config';
import { channelConfig } from '../discord/channel.config';

@Module({
  imports: [ConfigModule.forFeature(channelConfig)],
  providers: [NicknameStateService],
  exports: [NicknameStateService],
})
export class BotCommandModule {}
