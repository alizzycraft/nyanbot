import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { channelConfig } from '../discord/channel.config';
import { NicknameManagerModule } from '../nickname-manager/nickname-manager.module';

@Module({
  imports: [ConfigModule.forFeature(channelConfig), NicknameManagerModule],
  providers: [],
  exports: [],
})
export class BotCommandModule {}
