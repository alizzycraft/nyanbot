import { Module } from '@nestjs/common';
import { ReactionRoleColony } from './reaction-role.colony';
import { roleMessageConfigs } from './role-message.config';
import { SwarmModule } from '../../swarm/swarm.module';
import { BotCommandModule } from '../../nanites/discord/bot-command.module';
import { RoleMessageStateService } from './role-message-state.service';
import { ConfigModule } from '@nestjs/config';
import { channelConfig } from '../../nanites/discord/channel.config';

@Module({
  imports: [SwarmModule, BotCommandModule, ConfigModule.forFeature(channelConfig)],
  providers: [
    ReactionRoleColony,
    RoleMessageStateService,
    {
      provide: 'ROLE_MESSAGE_CONFIGS',
      useValue: roleMessageConfigs,
    },
  ],
  exports: [RoleMessageStateService],
})
export class ReactionRoleColonyModule {}