import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import {
  DiscordMessageReactionAddCommand,
  isDiscordMessageReactionAddCommand,
  DISCORD_NANITE_COMMAND_SET_NICKNAME,
} from '../discord/discord.interface';
import type { RoleMessageConfig } from '../../role-message/interfaces/role-message.interface';
import { RoleMessageStateService } from '../../role-message/role-message-state.service';
import { NicknameStateService } from '../../bot-command/nickname-state.service';
import {
  isReactionRoleAssignRoleCommand,
  isReactionRoleRemoveRoleCommand,
  isReactionRoleUpdateNicknameCommand,
  ReactionRoleAssignRoleCommandPayload,
  ReactionRoleRemoveRoleCommandPayload,
  ReactionRoleUpdateNicknameCommandPayload,
} from './reaction-role.interface';
import { REACTION_ROLE_COMMAND_UPDATE_NICKNAME } from './reaction-role.interface';
import { PostedRoleMessage } from '../../role-message/interfaces/role-message.interface';
import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { DiscordNanite } from '../discord/discord.nanite';

@Injectable()
export class ReactionRoleNanite implements OnModuleInit {
  private readonly logger = new Logger(ReactionRoleNanite.name);
  private isAutoPosting = false;

  constructor(
    private readonly swarmService: SwarmService,
    @Inject('ROLE_MESSAGE_CONFIGS')
    private roleMessageConfigs: RoleMessageConfig[],
    private readonly roleMessageStateService: RoleMessageStateService,
    private readonly nicknameStateService: NicknameStateService,
    private readonly discordNanite: DiscordNanite,
  ) {}

  onModuleInit() {
    // Subscribe to message reaction add events
    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageReactionAddCommand))
      .subscribe((command) => {
        this.logger.debug('Received DiscordMessageReactionAddCommand in ReactionRoleNanite');
        void this.handleReactionAdd(command);
      });

    // Subscribe to reaction role commands
    this.swarmService.commandQueue$
      .pipe(filter(isReactionRoleAssignRoleCommand))
      .subscribe((command) => {
        this.logger.debug('Received ReactionRoleAssignRoleCommand in ReactionRoleNanite');
        void this.handleAssignRole(command.payload);
      });

    this.swarmService.commandQueue$
      .pipe(filter(isReactionRoleRemoveRoleCommand))
      .subscribe((command) => {
        this.logger.debug('Received ReactionRoleRemoveRoleCommand in ReactionRoleNanite');
        void this.handleRemoveRole(command.payload);
      });

    this.swarmService.commandQueue$
      .pipe(filter(isReactionRoleUpdateNicknameCommand))
      .subscribe((command) => {
        this.logger.debug('Received ReactionRoleUpdateNicknameCommand in ReactionRoleNanite');
        void this.handleUpdateNickname(command.payload);
      });

    this.logger.log('ReactionRoleNanite initialized');
  }

  private async handleReactionAdd(command: DiscordMessageReactionAddCommand) {
    this.logger.debug('Handling reaction add in ReactionRoleNanite');
    const { reaction, user } = command.payload;

    // Ignore bot reactions
    if (user.bot) {
      this.logger.debug('Ignoring bot reaction');
      return;
    }

    try {
      this.logger.debug(`Processing reaction ${reaction.emoji.name} from user ${user.tag} on message ${reaction.message.id}`);
      
      // Check if the reaction is on a role message
      const postedMessage = this.roleMessageStateService.getPostedMessageByMessageId(
        reaction.message.id,
      );
      
      this.logger.debug(`Posted message lookup result for ${reaction.message.id}: ${postedMessage ? 'FOUND' : 'NOT FOUND'}`);
      
      if (!postedMessage) {
        this.logger.debug(`Message ${reaction.message.id} is not a role message. Available role message IDs: ${this.getRoleMessageIds()}`);
        
        // Check if we should automatically post role messages
        const shouldAutoPost = this.shouldAutoPostRoleMessages();
        if (shouldAutoPost && !this.areRoleMessagesPosted() && !this.isAutoPosting) {
          this.isAutoPosting = true;
          this.logger.log('Role messages not found. Triggering automatic posting.');
          await this.autoPostRoleMessages(reaction.message.guild?.id || '');
          this.isAutoPosting = false;
          // After posting, check again if this is now a role message
          const newPostedMessage = this.roleMessageStateService.getPostedMessageByMessageId(
            reaction.message.id,
          );
          if (!newPostedMessage) {
            this.logger.debug('Message is still not a role message after auto-posting');
            return;
          }
          // Continue processing with the newly posted message
          this.processRoleReaction(newPostedMessage, reaction, user);
          return;
        } else if (shouldAutoPost && this.areRoleMessagesPosted()) {
          // Role messages exist but this reaction is not on one of them
          this.logger.debug('Role messages exist but this reaction is not on a role message. Ignoring.');
          return;
        } else if (this.isAutoPosting) {
          this.logger.debug('Already auto-posting role messages. Ignoring reaction.');
          return;
        }
        
        // Not a role message, ignore
        return;
      }
      
      this.processRoleReaction(postedMessage, reaction, user);
    } catch (error) {
      this.isAutoPosting = false; // Reset flag in case of error
      this.logger.error(
        `Error processing reaction on message ${reaction.message.id}`,
        error as Error,
      );
    }
  }

  private shouldAutoPostRoleMessages(): boolean {
    // For now, we'll always auto-post if role messages don't exist
    // In a real implementation, this could be configurable
    return true;
  }

  private areRoleMessagesPosted(): boolean {
    try {
      const state = this.swarmService.executeQuery<Record<string, PostedRoleMessage>>('persistence:getState', 'roleMessages');
      return !!state && Object.keys(state).length > 0;
    } catch (error) {
      this.logger.error('Error checking if role messages are posted:', error as Error);
      return false;
    }
  }

  private async autoPostRoleMessages(guildId: string) {
    this.logger.log(`Auto-posting role messages for guild: ${guildId}`);
    
    // Set a timeout to reset the flag in case something goes wrong
    const timeout = setTimeout(() => {
      this.isAutoPosting = false;
      this.logger.warn('Auto-posting timeout reached. Resetting flag.');
    }, 30000); // 30 seconds timeout
    
    try {
      // First, clear the roles channel
      await this.clearRolesChannel();
      
      // Dispatch admin command to post roles
      this.swarmService.dispatch({
        type: 'admin:postRoles',
        payload: {
          guildId: guildId,
        },
      });
      
      // Wait a bit for the messages to be posted
      await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
      clearTimeout(timeout);
    }
  }

  private async clearRolesChannel() {
    this.logger.log('Clearing roles channel');
    try {
      // Get the roles channel ID from the swarm service
      const channels = this.swarmService.executeQuery<Record<string, string>>('admin:getChannels');
      if (!channels || !channels.roles) {
        this.logger.warn('Could not get roles channel ID');
        return;
      }

      const rolesChannelId = channels.roles;
      this.logger.debug(`Roles channel ID: ${rolesChannelId}`);

      // Get the channel
      const channel = await this.discordNanite.getTextChannel(rolesChannelId);
      if (!channel) {
        this.logger.warn('Could not get roles channel');
        return;
      }

      // Fetch and delete messages
      const messages = await channel.messages.fetch({ limit: 100 });
      this.logger.debug(`Found ${messages.size} messages to delete`);

      // Delete messages in batches
      for (const [id, message] of messages) {
        try {
          await message.delete();
          this.logger.debug(`Deleted message ${id}`);
        } catch (error) {
          this.logger.error(`Failed to delete message ${id}:`, error as Error);
        }
      }

      this.logger.log('Finished clearing roles channel');
    } catch (error) {
      this.logger.error('Error clearing roles channel:', error as Error);
    }
  }

  private processRoleReaction(
    postedMessage: PostedRoleMessage,
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    this.logger.log(`Found role message for reaction on message ${reaction.message.id}`);

    // Find the corresponding role configuration
    const config = this.roleMessageConfigs.find(
      (c) => c.id === postedMessage.configId,
    );

    if (!config || !reaction.message.guild) {
      this.logger.warn(
        `Config or guild not found for reaction on message ${reaction.message.id}`,
      );
      return;
    }

    const emoji = reaction.emoji.name || reaction.emoji.id;
    if (!emoji) {
      this.logger.debug('No emoji name or ID found');
      return;
    }

    const mapping = config.reactions.find((r) => r.emoji === emoji);
    if (!mapping) {
      this.logger.debug(`No mapping found for emoji ${emoji} in config ${config.id}`);
      this.logger.debug(`Available emojis in config ${config.id}: ${config.reactions.map(r => r.emoji).join(', ')}`);
      return;
    }

    // Dispatch appropriate command based on the configuration
    switch (config.action.type) {
      case 'UPDATE_NICKNAME':
        this.logger.log(`Dispatching UPDATE_NICKNAME command for emoji ${emoji}`);
        // For nickname updates, we need to toggle the value
        const partType = config.id === 'pronoun-roles' ? 'pronoun' : 'politics';
        
        this.swarmService.dispatch({
          type: REACTION_ROLE_COMMAND_UPDATE_NICKNAME,
          payload: {
            userId: user.id,
            partType: partType as 'pronoun' | 'politics',
            value: mapping.value,
            guildId: reaction.message.guild.id,
          },
        });
        break;
      case 'ASSIGN_ROLE':
        // For role assignments, we would dispatch assign/remove role commands
        // Implementation would depend on the specific requirements
        this.logger.log(
          `Would assign role ${mapping.value} to user ${user.id}`,
        );
        break;
      default:
        this.logger.warn(`Unknown action type for config: ${config.id}`);
    }

    this.logger.log(
      `Processing reaction ${reaction.emoji.name} added by ${user.tag} on message ${reaction.message.id}`,
    );
  }

  private getRoleMessageIds(): string {
    try {
      // This is a helper method to get all role message IDs for debugging
      // We'll need to access the state directly for this
      const state = this.swarmService.executeQuery<Record<string, PostedRoleMessage>>('persistence:getState', 'roleMessages');
      if (!state) {
        return 'NO_STATE';
      }
      return Object.keys(state).join(', ') || 'NONE';
    } catch (error) {
      return 'ERROR_GETTING_IDS';
    }
  }

  private handleAssignRole(payload: ReactionRoleAssignRoleCommandPayload) {
    // Implementation for assigning a role to a user
    this.logger.log(
      `Assigning role ${payload.roleId} to user ${payload.userId} in guild ${payload.guildId}`,
    );
  }

  private handleRemoveRole(payload: ReactionRoleRemoveRoleCommandPayload) {
    // Implementation for removing a role from a user
    this.logger.log(
      `Removing role ${payload.roleId} from user ${payload.userId} in guild ${payload.guildId}`,
    );
  }

  private async handleUpdateNickname(
    payload: ReactionRoleUpdateNicknameCommandPayload,
  ) {
    this.logger.debug(`Handling update nickname for user ${payload.userId}`);
    try {
      // Get current nickname parts
      let nicknameParts = this.nicknameStateService.getNicknameParts(
        payload.userId,
      ) || { pronoun: undefined, politics: undefined };

      this.logger.debug(`Current nickname parts for user ${payload.userId}: ${JSON.stringify(nicknameParts)}`);

      // Toggle the value - if it's the same as the current value, remove it; otherwise set it
      let newValue: string | undefined = payload.value;
      
      if (payload.partType === 'pronoun') {
        if (nicknameParts.pronoun === payload.value) {
          newValue = undefined; // Toggle off
        }
        this.nicknameStateService.updatePronoun(payload.userId, newValue);
        nicknameParts = { ...nicknameParts, pronoun: newValue };
      } else if (payload.partType === 'politics') {
        // For politics, we want to enforce single selection
        // If they're selecting the same value, toggle it off
        // If they're selecting a different value, replace the current one
        // If they're selecting a value when none is set, set it
        if (nicknameParts.politics === payload.value) {
          newValue = undefined; // Toggle off
        }
        this.nicknameStateService.updatePolitics(payload.userId, newValue);
        nicknameParts = { ...nicknameParts, politics: newValue };
      }

      this.logger.debug(`Updated nickname parts for user ${payload.userId}: ${JSON.stringify(nicknameParts)}`);

      // Build the new nickname parts string (the Discord nanite will handle the base name)
      let nicknameSuffix = '';
      
      if (nicknameParts?.pronoun) {
        nicknameSuffix += ` (${nicknameParts.pronoun})`;
      }
      if (nicknameParts?.politics) {
        nicknameSuffix += ` [${nicknameParts.politics}]`;
      }

      this.logger.debug(`Constructed nickname suffix for user ${payload.userId}: ${nicknameSuffix}`);

      // Dispatch command to Discord nanite to update the nickname
      // We'll send just the suffix and let the Discord nanite handle the base name
      this.logger.log(`Dispatching SET_NICKNAME command for user ${payload.userId} with suffix: ${nicknameSuffix}`);
      this.swarmService.dispatch({
        type: DISCORD_NANITE_COMMAND_SET_NICKNAME,
        payload: {
          userId: payload.userId,
          guildId: payload.guildId,
          nickname: nicknameSuffix, // Just the suffix, Discord nanite will prepend the base name
        },
      });

      this.logger.log(
        `Updated ${payload.partType} for user ${payload.userId} to ${newValue || 'undefined'} in guild ${payload.guildId}. Nickname suffix: ${nicknameSuffix}`,
      );
    } catch (error) {
      this.logger.error(
        `Error updating nickname for user ${payload.userId}`,
        error as Error,
      );
    }
  }

  private hasPoliticalAlignment(userId: string): boolean {
    try {
      const nicknameParts = this.nicknameStateService.getNicknameParts(userId);
      return !!nicknameParts?.politics;
    } catch (error) {
      this.logger.error(`Error checking political alignment for user ${userId}:`, error as Error);
      return false;
    }
  }
}