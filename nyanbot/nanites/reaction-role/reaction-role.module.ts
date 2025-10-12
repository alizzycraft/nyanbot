import { Module } from '@nestjs/common';
import { ReactionRoleNanite } from './reaction-role.nanite';
import { roleMessageConfigs } from '../../role-message/role-message.config';
import { SwarmModule } from '../../swarm/swarm.module';
import { RoleMessageModule } from '../../role-message/role-message.module';
import { BotCommandModule } from '../../bot-command/bot-command.module';
import { DiscordNaniteModule } from '../discord/discord.module';

@Module({
  imports: [
    SwarmModule,
    RoleMessageModule,
    BotCommandModule,
    DiscordNaniteModule,
  ],
  providers: [
    ReactionRoleNanite,
    {
      provide: 'ROLE_MESSAGE_CONFIGS',
      useValue: roleMessageConfigs,
    },
  ],
})
export class ReactionRoleNaniteModule {}