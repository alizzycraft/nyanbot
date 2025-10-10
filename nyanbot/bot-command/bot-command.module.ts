import { Module } from '@nestjs/common';
import { AdminCommandService } from './admin-command.service';
import { ReactionRoleHandlerService } from './reaction-role-handler.service';
import { NicknameStateService } from './nickname-state.service';
import { DiscordModule } from '../discord/discord.module';
import { RoleMessageModule } from '../role-message/role-message.module';
import { ConfigModule } from '@nestjs/config';
import { channelConfig } from '../discord/channel.config';

@Module({
  imports: [DiscordModule, RoleMessageModule, ConfigModule.forFeature(channelConfig)],
  providers: [
    AdminCommandService,
    ReactionRoleHandlerService,
    NicknameStateService,
  ],
})
export class BotCommandModule {}
