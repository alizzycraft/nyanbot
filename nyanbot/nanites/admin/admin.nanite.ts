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
import { channelConfig } from '../../discord/channel.config';
import type { RoleMessageConfig } from '../../role-message/interfaces/role-message.interface';
import { RoleMessageStateService } from '../../role-message/role-message-state.service';
import { PostedRoleMessage } from '../../role-message/interfaces/role-message.interface';
import { Guild } from 'discord.js';
import { DiscordNanite } from '../discord/discord.nanite';

@Injectable()
export class AdminNanite implements OnModuleInit {
  private readonly logger = new Logger(AdminNanite.name);

  constructor(
    private readonly swarmService: SwarmService,
    @Inject(channelConfig.KEY)
    private channels: ConfigType<typeof channelConfig>,
    @Inject('ROLE_MESSAGE_CONFIGS')
    private roleMessageConfigs: RoleMessageConfig[],
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

  private async handlePostRolesCommand(guildId: string) {
    this.logger.log(`Received post-roles command for guild: ${guildId}`);

    try {
      // Get the guild
      const guild = await this.discordNanite.getClient().guilds.fetch(guildId);
      if (!guild) {
        this.logger.error('Cannot post role messages: Guild not found.');
        return;
      }

      // Delete existing role messages before clearing state
      await this.deleteExistingRoleMessages(guild);

      // Clear existing role message state
      this.roleMessageStateService.clearState();

      // Post all role messages
      await this.postAllRoleMessages(guild);
    } catch (error) {
      this.logger.error('Error in handlePostRolesCommand:', error as Error);
    }
  }

  private async deleteExistingRoleMessages(guild: Guild) {
    this.logger.log('Deleting existing role messages');
    try {
      // Get current messages from state
      let currentMessages: Record<string, PostedRoleMessage> = {};
      try {
        currentMessages =
          this.swarmService.executeQuery<Record<string, PostedRoleMessage>>(
            'persistence:getState',
            'roleMessages',
          ) || {};
      } catch {
        this.logger.debug('No existing role messages state found');
        return;
      }

      // Delete each message
      for (const [messageId, postedMessage] of Object.entries(currentMessages)) {
        try {
          const channel = await this.discordNanite.getTextChannel(postedMessage.channelId);
          if (channel) {
            const message = await channel.messages.fetch(messageId);
            if (message) {
              await message.delete();
              this.logger.log(`Deleted old role message: ${messageId}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Failed to delete message ${messageId}:`, error as Error);
        }
      }
    } catch (error) {
      this.logger.error('Error deleting existing role messages:', error as Error);
    }
  }

  private async postAllRoleMessages(guild: Guild) {
    this.logger.log(`Posting all role messages to guild ${guild.name}`);
    for (const config of this.roleMessageConfigs) {
      try {
        const channelId =
          this.channels[config.channel as keyof typeof this.channels];
        if (!channelId || typeof channelId !== 'string') {
          this.logger.warn(
            `Channel key '${config.channel}' not found or is not a single ID in config for message: ${config.id}. Skipping.`,
          );
          continue;
        }

        this.logger.debug(
          `Fetching channel ${channelId} for config ${config.id}`,
        );
        const channel = await this.discordNanite.getTextChannel(channelId);
        if (!channel) {
          this.logger.warn(
            `Channel not found for ID: ${channelId} (Key: ${config.channel}). Skipping.`,
          );
          continue;
        }

        // Send the message
        this.logger.log(
          `Sending role message for '${config.id}' to channel #${channel.name}`,
        );
        const message = await channel.send(config.content);
        this.logger.log(
          `Posted role message for '${config.id}' in #${channel.name} with ID ${message.id}`,
        );

        // Create posted message object
        const posted: PostedRoleMessage = {
          configId: config.id,
          guildId: guild.id,
          channelId: channel.id,
          messageId: message.id,
          postedAt: new Date(),
        };

        // Save to state
        this.roleMessageStateService.addPostedMessage(posted);

        // Add reactions
        for (const reaction of config.reactions) {
          try {
            this.logger.debug(
              `Adding reaction ${reaction.emoji} to message ${message.id}`,
            );
            await message.react(reaction.emoji);
            this.logger.debug(
              `Added reaction ${reaction.emoji} for '${config.id}' message.`,
            );
          } catch (error) {
            this.logger.error(
              `Failed to add reaction ${reaction.emoji} for config ${config.id}:`,
              error as Error,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Error processing role message config ${config.id}:`,
          error as Error,
        );
      }
    }
  }
}
