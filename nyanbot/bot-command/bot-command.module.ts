import { Module } from '@nestjs/common';
import { NicknameStateService } from './nickname-state.service';
import { RoleMessageModule } from '../role-message/role-message.module';
import { ConfigModule } from '@nestjs/config';
import { channelConfig } from '../discord/channel.config';

@Module({
  imports: [RoleMessageModule, ConfigModule.forFeature(channelConfig)],
  providers: [NicknameStateService],
  exports: [NicknameStateService],
})
export class BotCommandModule {}
