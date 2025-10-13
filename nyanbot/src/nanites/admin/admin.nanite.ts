import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import {
  DiscordMessageCreateCommand,
  isDiscordMessageCreateCommand,
  DISCORD_NANITE_COMMAND_SEND_MESSAGE,
} from '../discord/discord.interface';
import { isAdminPostRolesCommand } from './admin.interface';
import type { ConfigType } from '@nestjs/config';
import { channelConfig } from '../discord/channel.config';
import { RoleMessageStateService } from '../../colonies/reaction-role/role-message-state.service';
import { DiscordNanite } from '../discord/discord.nanite';

@Injectable()
export class AdminNanite implements OnModuleInit {
  private readonly logger = new Logger(AdminNanite.name);

  constructor(
    private readonly swarmService: SwarmService,
    @Inject(channelConfig.KEY)
    private channels: ConfigType<typeof channelConfig>,
    private roleMessageStateService: RoleMessageStateService,
    private discordNanite: DiscordNanite,
  ) {}

  onModuleInit() {
    // Subscribe to message creation events
    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageCreateCommand))
      .subscribe((command) => {
        this.logger.debug(
          'Received DiscordMessageCreateCommand in AdminNanite',
        );
        void this.handleMessage(command);
      });

    // Subscribe to admin commands
    this.swarmService.commandQueue$
      .pipe(filter(isAdminPostRolesCommand))
      .subscribe((command) => {
        this.logger.debug('Received AdminPostRolesCommand in AdminNanite');
        void this.handlePostRolesCommand(command.payload.guildId);
      });

    // Register query handler for channel configuration
    this.swarmService.registerQueryHandler('admin:getChannels', () => {
      return this.channels;
    });

    this.logger.log('AdminNanite initialized');
  }

  private handleMessage(command: DiscordMessageCreateCommand) {
    this.logger.debug('Handling message in AdminNanite');
    const message = command.payload;

    this.logger.debug(
      `Received message in channel ${message.channel.id} from ${message.author.tag}: ${message.content}`,
    );

    // Check if message is in admin channel
    if (message.channel.id !== this.channels.admin) {
      this.logger.debug(
        `Message not in admin channel. Expected: ${this.channels.admin}, Got: ${message.channel.id}`,
      );
      return;
    }

    // Check if message starts with command prefix
    if (!message.content.startsWith('!nyan')) {
      this.logger.debug('Message does not start with !nyan prefix');
      return;
    }

    // Ignore bot messages
    if (message.author.bot) {
      this.logger.debug('Ignoring bot message');
      return;
    }

    this.logger.log(`Processing admin command from ${message.author.tag}`);

    // For now, we'll assume the user is admin (in a real implementation,
    // we would check permissions)

    const commandText = message.content.slice('!nyan'.length).trim();

    if (commandText === 'post-roles') {
      this.logger.log(
        `Admin ${message.author.tag} triggered 'post-roles' command.`,
      );

      // Send reply to user
      this.swarmService.dispatch({
        type: DISCORD_NANITE_COMMAND_SEND_MESSAGE,
        payload: {
          channelId: message.channel.id,
          message: 'Clearing old role messages and posting new ones...',
        },
      });

      // Dispatch admin command to post roles
      this.swarmService.dispatch({
        type: 'admin:postRoles',
        payload: {
          guildId: message.guild?.id || '',
        },
      });
    } else {
      this.logger.debug(`Unknown command: ${commandText}`);
    }
  }

  private handlePostRolesCommand(guildId: string) {
    this.logger.log(`Received post-roles command for guild: ${guildId}`);

    // TODO: This should be handled by the ReactionRoleColony
    // The AdminNanite should only dispatch a high-level command to the colony.

    this.logger.log('Clearing role message state.');
    this.roleMessageStateService.clearState();

    this.logger.log('Dispatching command to colony to post roles');
    this.swarmService.dispatch({
      type: 'colony:reaction-role:deploy',
      payload: { guildId },
    });
  }
}
