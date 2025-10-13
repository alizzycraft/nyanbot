import { Injectable, Logger, Inject } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs';
import {
  isDiscordMessageReactionAddCommand,
  isDiscordMessageReactionRemoveCommand,
  DISCORD_NANITE_COMMAND_SET_NICKNAME,
  DISCORD_NANITE_COMMAND_SEND_MESSAGE,
  DiscordMessageReactionAddCommand,
  DiscordMessageReactionRemoveCommand,
} from '../../nanites/discord/discord.interface';
import { RoleMessageConfig } from './interfaces/role-message.interface';
import {
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
  Message,
} from 'discord.js';
import { RoleMessageStateService } from './role-message-state.service';
import type { ConfigType } from '@nestjs/config';
import { channelConfig } from '../../nanites/discord/channel.config';
import { PostedRoleMessage } from './interfaces/role-message.interface';
import { Command } from '../../swarm/interfaces/command.interface';
import { DiscordReadyEvent } from '../../nanites/discord/discord.interface';
import { NicknameParts, UpdateNicknamePayload } from '../../nanites/nickname-manager/nickname-manager.interface';

// Use a class property instead of a global variable for better control
interface DeployCommandPayload {
  guildId: string;
}

@Injectable()
export class ReactionRoleColony {
  private readonly logger = new Logger(ReactionRoleColony.name);
  private deploymentInProgress = false;
  private deploymentCompleted = false;

  // Add a set to track which guilds we've already processed
  private processedGuilds = new Set<string>();
  private guildChannels: Record<string, Record<string, string>> = {};
  private allowedGuilds: string[] | undefined;

  constructor(
    private readonly swarmService: SwarmService,
    private readonly roleMessageStateService: RoleMessageStateService,
    @Inject('ROLE_MESSAGE_CONFIGS')
    private roleMessageConfigs: RoleMessageConfig[],
    @Inject(channelConfig.KEY)
    private channels: ConfigType<typeof channelConfig>,
  ) {
    this.logger.log('ReactionRoleColony instantiated');

    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageReactionAddCommand))
      .subscribe((command: DiscordMessageReactionAddCommand) => {
        this.logger.debug('Reaction added');
        void this.handleAddRole(command.payload.reaction, command.payload.user);
      });

    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageReactionRemoveCommand))
      .subscribe((command: DiscordMessageReactionRemoveCommand) => {
        this.logger.debug('Reaction removed');
        void this.handleRemoveRole(
          command.payload.reaction,
          command.payload.user,
        );
      });

    this.swarmService.commandQueue$
      .pipe(filter((command: Command) => command.type === 'discord:ready'))
      .subscribe(async (command: Command<DiscordReadyEvent>) => {
        this.logger.log(`Received discord:ready event with ${command.payload.guilds.length} guilds: ${command.payload.guilds.join(', ')}`);
        
        // Store guild channel mappings if provided
        if (command.payload.guildChannels) {
          this.guildChannels = command.payload.guildChannels;
          this.logger.log(`Received guild channel mappings: ${JSON.stringify(this.guildChannels)}`);
        }
        
        // Skip if deployment is already in progress
        if (this.deploymentInProgress) {
          this.logger.log('Deployment already in progress, skipping.');
          return;
        }
        
        this.deploymentInProgress = true;
        // Reset the processed guilds tracking for each new deployment
        this.processedGuilds.clear();

        try {
          this.logger.log('Discord ready, cleaning up stale role messages');
          await this.cleanupRoleMessages();

          this.logger.log('Discord ready, deploying role messages');
          for (const guildId of command.payload.guilds) {
            // Check if we've already processed this guild in this deployment
            if (this.processedGuilds.has(guildId)) {
              this.logger.log(`Skipping already processed guild: ${guildId}`);
              continue;
            }
            
            this.logger.log(`Deploying messages for guild: ${guildId}`);
            await this.handleDeployCommand(guildId);
            this.processedGuilds.add(guildId);
          }
          
          this.logger.log('Role message deployment completed successfully');
        } catch (error) {
          this.logger.error('Error during role message deployment:', error);
        } finally {
          this.deploymentInProgress = false;
        }
      });
  }

  private async cleanupRoleMessages(): Promise<void> {
    const postedMessages = await this.roleMessageStateService.getPostedMessages();
    for (const messageId in postedMessages) {
      const postedMessage = postedMessages[messageId];
      const message = await this.swarmService.executeQuery<Promise<Message | null>>(
        'discord:getMessage',
        {
          channelId: postedMessage.channelId,
          messageId: postedMessage.messageId,
        },
      );
      if (!message) {
        this.logger.log(
          `Message ${postedMessage.messageId} not found, removing from state.`,
        );
        await this.roleMessageStateService.removePostedMessage(
          postedMessage.messageId,
        );
      }
    }
  }

  private async handleDeployCommand(guildId: string): Promise<void> {
    this.logger.log(`Starting deployment for guild ${guildId}`);
    
    // Log current role message configs
    this.logger.log(`Found ${this.roleMessageConfigs.length} role message configurations`);
    
    // Keep track of deployed messages in this session to prevent race conditions
    const deployedInThisSession: Set<string> = new Set();
    
    for (const config of this.roleMessageConfigs) {
      this.logger.log(`Checking if message ${config.id} is already posted for guild ${guildId}`);
      this.logger.log(`Message content: ${config.content.substring(0, 50)}...`);
      
      // Check our session cache first
      if (deployedInThisSession.has(`${config.id}-${guildId}`)) {
        this.logger.log(
          `Role message ${config.id} already deployed in this session for guild ${guildId}. Skipping.`,
        );
        continue;
      }
      
      const postedMessages = await this.roleMessageStateService.getPostedMessages();
      
      // Log all currently posted messages for debugging
      this.logger.log(`Currently posted messages: ${JSON.stringify(Object.values(postedMessages).map(pm => ({configId: pm.configId, guildId: pm.guildId, messageId: pm.messageId})))}`);
      
      const isAlreadyPosted = Object.values(postedMessages).some(
        (pm) => pm.configId === config.id && pm.guildId === guildId,
      );

      if (isAlreadyPosted) {
        this.logger.log(
          `Role message ${config.id} already deployed for guild ${guildId}. Skipping.`,
        );
        continue;
      }

      this.logger.log(`Preparing to post message ${config.id} for guild ${guildId}`);
      this.logger.log(`Message content preview: ${config.content.substring(0, 100)}...`);
      
      // Get guild-specific channel ID
      let channelId: string | undefined;
      
      // First check if we have guild-specific channel mappings from database
      if (this.guildChannels[guildId] && this.guildChannels[guildId][config.channel]) {
        channelId = this.guildChannels[guildId][config.channel];
        this.logger.log(`Using database-configured channel ID ${channelId} for guild ${guildId}`);
      } 
      // Fall back to the general channel configuration
      else {
        channelId = this.channels[config.channel as keyof typeof this.channels] as string | undefined;
        if (channelId) {
          this.logger.log(`Using general channel ID ${channelId} for guild ${guildId}`);
        } else {
          this.logger.warn(
            `No channel configured for '${config.channel}' in guild ${guildId}. ` +
            `Please set the channel ID using the admin interface or configuration.`
          );
          continue;
        }
      }
      
      if (!channelId || typeof channelId !== 'string') {
        this.logger.warn(
          `Channel key '${config.channel}' not found for guild ${guildId}. Skipping.`,
        );
        continue;
      }

      this.logger.log(`Using channel ID ${channelId} for message ${config.id} in guild ${guildId}`);

      await new Promise<void>((resolve) => {
        this.swarmService.dispatch({
          type: DISCORD_NANITE_COMMAND_SEND_MESSAGE,
          payload: {
            channelId: channelId,
            message: config.content,
            onSent: async (message: Message) => {
              this.logger.log(`Message sent for ${config.id} in guild ${guildId}, message ID: ${message.id}`);
              this.logger.log(`Full message content: ${message.content}`);
              this.logger.log(`Message timestamp: ${message.createdTimestamp}`);
              
              const posted: PostedRoleMessage = {
                configId: config.id,
                guildId: guildId,
                channelId: channelId,
                messageId: message.id,
                postedAt: new Date(),
              };
              await this.roleMessageStateService.addPostedMessage(posted);
              
              // Add to our session cache
              deployedInThisSession.add(`${config.id}-${guildId}`);
              
              this.logger.log(`Added message ${message.id} to state for ${config.id} in guild ${guildId}`);
              
              // Log reaction information
              this.logger.log(`Adding ${config.reactions.length} reactions to message ${message.id}`);
              for (const reaction of config.reactions) {
                this.logger.log(`Adding reaction ${reaction.emoji} (${reaction.value}) to message ${message.id}`);
                this.swarmService.dispatch({
                  type: 'discord:addReaction',
                  payload: {
                    message: message,
                    emoji: reaction.emoji,
                  },
                });
              }
              resolve();
            },
          },
        });
      });
    }
    
    this.logger.log(`Completed deployment for guild ${guildId}`);
  }

  private async handleAddRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    this.logger.log(
      `Handling role addition for ${user.tag} on message ${reaction.message.id}`,
    );

    // Find the posted message to get the config ID
    const postedMessage = await this.roleMessageStateService.getPostedMessageByMessageId(
      reaction.message.id,
    );

    if (!postedMessage) {
      this.logger.debug('Not a role message');
      return;
    }

    // Find the role message config by config ID
    const roleMessageConfig = this.roleMessageConfigs.find(
      (rm) => rm.id === postedMessage.configId,
    );

    if (!roleMessageConfig) {
      this.logger.debug('Role message config not found');
      return;
    }

    // Find the role mapping for the emoji
    const roleMapping = roleMessageConfig.reactions.find(
      (r) => r.emoji === reaction.emoji.name,
    );

    if (!roleMapping) {
      this.logger.debug('No role mapping for this emoji');
      return;
    }

    // Handle different action types per reaction
    const actionType = roleMapping.action.type;
    this.logger.log(
      `Action type for reaction ${reaction.emoji.name}: ${actionType}`,
    );

    if (actionType === 'UPDATE_NICKNAME' || actionType === 'BOTH') {
      this.logger.log(`Calling handleUpdateNickname for ${user.tag}`);
      await this.handleUpdateNickname(
        reaction,
        user,
        roleMessageConfig,
        roleMapping,
      );
    }

    if (actionType === 'ASSIGN_ROLE' || actionType === 'BOTH') {
      this.logger.log(`Calling handleAssignRole for ${user.tag}`);
      await this.handleAssignRole(
        reaction,
        user,
        roleMessageConfig,
        roleMapping,
      );
    }
  }

  private async handleRemoveRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    this.logger.log(
      `Handling role removal for ${user.tag} on message ${reaction.message.id}`,
    );

    // Find the posted message to get the config ID
    const postedMessage =
      await this.roleMessageStateService.getPostedMessageByMessageId(
        reaction.message.id,
      );

    if (!postedMessage) {
      this.logger.debug('Not a role message');
      return;
    }

    // Find the role message config by config ID
    const roleMessageConfig = this.roleMessageConfigs.find(
      (rm) => rm.id === postedMessage.configId,
    );

    if (!roleMessageConfig) {
      this.logger.debug('Role message config not found');
      return;
    }

    // Find the role mapping for the emoji
    const roleMapping = roleMessageConfig.reactions.find(
      (r) => r.emoji === reaction.emoji.name,
    );

    if (!roleMapping) {
      this.logger.debug('No role mapping for this emoji');
      return;
    }

    // Handle different action types per reaction
    const actionType = roleMapping.action.type;
    this.logger.log(
      `Action type for reaction ${reaction.emoji.name}: ${actionType}`,
    );

    if (actionType === 'UPDATE_NICKNAME' || actionType === 'BOTH') {
      this.logger.log(`Calling handleRemoveNickname for ${user.tag}`);
      await this.handleRemoveNickname(reaction, user, roleMessageConfig, roleMapping);
    }

    if (actionType === 'ASSIGN_ROLE' || actionType === 'BOTH') {
      this.logger.log(`Calling handleUnassignRole for ${user.tag}`);
      await this.handleUnassignRole(
        reaction,
        user,
        roleMessageConfig,
        roleMapping,
      );
    }
  }

  private async handleAssignRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: {
      emoji: string;
      value: string;
      action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' };
    },
  ) {
    this.logger.log(
      `handleAssignRole called for user ${user.tag} with value ${roleMapping.value}`,
    );

    // Only proceed with role assignment if the action type is ASSIGN_ROLE or BOTH
    if (
      roleMapping.action.type !== 'ASSIGN_ROLE' &&
      roleMapping.action.type !== 'BOTH'
    ) {
      this.logger.log(
        `Skipping role assignment for ${roleMapping.value} because action type is ${roleMapping.action.type}`,
      );
      return;
    }

    // Get the guild member
    const guild = reaction.message.guild;
    if (!guild) {
      this.logger.error('Cannot add role: Guild not found.');
      return;
    }

    this.logger.log(`Fetching member ${user.id} from guild ${guild.id}`);
    const member = await guild.members.fetch(user.id);
    this.logger.log(`Fetched member ${member.user.tag}`);

    // Map abbreviations to full role names for political roles
    const roleAbbreviationToFullName: Record<string, string> = {
      L: 'Left',
      CL: 'Center-Left',
      C: 'Center',
      CR: 'Center-Right',
      R: 'Right',
    };

    // Get the full role name, or use the value directly if not in the mapping (for pronouns)
    const fullRoleName =
      roleAbbreviationToFullName[roleMapping.value] || roleMapping.value;
    this.logger.log(
      `Looking for role with full name '${fullRoleName}' (case-insensitive) for value '${roleMapping.value}'`,
    );

    // Check if role exists by name (case-insensitive)
    const role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === fullRoleName.toLowerCase(),
    );

    if (role) {
      this.logger.log(`Found existing role: ${role.name} (${role.id})`);
    } else {
      this.logger.log(`Role ${fullRoleName} not found, will create it`);
    }

    // Check if this is a single selection role message and we need to remove other selections
    if (roleMessageConfig.selectionType === 'single') {
      this.logger.log(
        `This is a single selection role message, removing other reactions for user ${user.tag}`,
      );
      
      // For nickname updates, remove other values of the same type
      const partType = roleMessageConfig.id === 'pronoun-roles' ? 'pronoun' : 'politics';
      if (partType === 'pronoun') {
        // For pronouns, we'll remove all other pronoun reactions the user has on this message
        // This is handled by the NicknameManagerNanite which only keeps one pronoun
      } else {
        // For politics, remove other political roles
        const roleAbbreviationToFullName: Record<string, string> = {
          L: 'Left',
          CL: 'Center-Left',
          C: 'Center',
          CR: 'Center-Right',
          R: 'Right',
        };
        
        // Only remove other political roles if this is a political role message
        if (roleMessageConfig.id === 'political-leaning-roles') {
          this.logger.log(
            `This is a political role, removing other political roles for user ${user.tag}`,
          );
          const politicalRoleNames = Object.values(roleAbbreviationToFullName);

          // Get all political roles in the guild
          const politicalRoles = guild.roles.cache.filter((role) =>
            politicalRoleNames.some(
              (name) => role.name.toLowerCase() === name.toLowerCase(),
            ),
          );

          // Remove any political roles the user currently has (except the one being added)
          for (const [roleId, politicalRole] of politicalRoles) {
            if (member.roles.cache.has(roleId) && (!role || roleId !== role.id)) {
              try {
                this.logger.log(
                  `Removing existing political role ${politicalRole.name} from ${user.tag}`,
                );
                await member.roles.remove(roleId);
                this.logger.log(
                  `Removed political role ${politicalRole.name} from ${user.tag}`,
                );
              } catch (error) {
                this.logger.error(
                  `Failed to remove political role ${politicalRole.name} from ${user.tag}`,
                  error,
                );
              }
            }
          }
        }
      }
      
      // For role assignments, remove other reactions of the same type from this user on this message
      if (roleMapping.action.type === 'ASSIGN_ROLE' || roleMapping.action.type === 'BOTH') {
        // Remove other reactions of the same type from this user on this message
        try {
          const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
          
          // For each reaction on this message (except the one being added)
          for (const [emoji, messageReaction] of message.reactions.cache) {
            if (emoji !== reaction.emoji.name) {
              // Check if this reaction is in our role mapping
              const otherRoleMapping = roleMessageConfig.reactions.find(r => r.emoji === emoji);
              if (otherRoleMapping) {
                // Remove the user from this reaction
                try {
                  await messageReaction.users.remove(user.id);
                  this.logger.log(
                    `Removed user ${user.tag} from reaction ${emoji}`,
                  );
                } catch (error) {
                  this.logger.error(
                    `Failed to remove user ${user.tag} from reaction ${emoji}`,
                    error,
                  );
                }
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to remove other reactions for user ${user.tag}`,
            error,
          );
        }
      }
    }

    // If role doesn't exist, create it
    if (!role) {
      try {
        this.logger.log(`Creating new role: ${fullRoleName}`);
        const newRole = await guild.roles.create({
          name: fullRoleName,
          reason: `Auto-created role for reaction role system`,
        });
        this.logger.log(`Created new role: ${newRole.name} (${newRole.id})`);

        // Add the newly created role
        this.logger.log(`Adding role ${newRole.name} to ${user.tag}`);
        await member.roles.add(newRole.id);
        this.logger.log(`Added role ${newRole.name} to ${user.tag}`);
      } catch (error) {
        this.logger.error(`Failed to create role ${fullRoleName}`, error);
        return;
      }
    }
    // If role exists, add it
    else {
      // Add the existing role
      try {
        this.logger.log(
          `Adding existing role ${role.name} (${role.id}) to ${user.tag} (${member.id})`,
        );
        this.logger.log(
          `Bot's highest role position: ${guild.members.me?.roles.highest.position}`,
        );
        this.logger.log(`Target role position: ${role.position}`);
        await member.roles.add(role.id);
        this.logger.log(`Added role ${role.name} to ${user.tag}`);
      } catch (error) {
        this.logger.error(
          `Failed to add role ${role.name} to ${user.tag}`,
          error,
        );
        this.logger.error(`Error details: ${JSON.stringify(error)}`);
      }
    }
  }

  private async handleUnassignRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: {
      emoji: string;
      value: string;
      action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' };
    },
  ) {
    this.logger.log(
      `handleUnassignRole called for user ${user.tag} with value ${roleMapping.value}`,
    );

    // Only proceed with role unassignment if the action type is ASSIGN_ROLE or BOTH
    if (
      roleMapping.action.type !== 'ASSIGN_ROLE' &&
      roleMapping.action.type !== 'BOTH'
    ) {
      this.logger.log(
        `Skipping role unassignment for ${roleMapping.value} because action type is ${roleMapping.action.type}`,
      );
      return;
    }

    // Get the guild member
    const guild = reaction.message.guild;
    if (!guild) {
      this.logger.error('Cannot remove role: Guild not found.');
      return;
    }
    const member = await guild.members.fetch(user.id);
    this.logger.log(`Fetched member ${member.user.tag}`);

    // Map abbreviations to full role names for political roles
    const roleAbbreviationToFullName: Record<string, string> = {
      L: 'Left',
      CL: 'Center-Left',
      C: 'Center',
      CR: 'Center-Right',
      R: 'Right',
    };

    // Get the full role name, or use the value directly if not in the mapping (for pronouns)
    const fullRoleName =
      roleAbbreviationToFullName[roleMapping.value] || roleMapping.value;
    this.logger.log(
      `Looking for role with full name '${fullRoleName}' (case-insensitive) for value '${roleMapping.value}'`,
    );

    // Check if role exists by name (case-insensitive)
    const role = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === fullRoleName.toLowerCase(),
    );

    if (role) {
      this.logger.log(`Found existing role: ${role.name} (${role.id})`);
    } else {
      this.logger.log(`Role ${fullRoleName} not found`);
    }

    // If role doesn't exist, log and return
    if (!role) {
      this.logger.warn(`Role ${fullRoleName} not found for removal`);
      return;
    }

    // Remove the role
    try {
      this.logger.log(`Removing role ${role.name} from ${user.tag}`);
      await member.roles.remove(role.id);
      this.logger.log(`Removed role ${role.name} from ${user.tag}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove role ${role.name} from ${user.tag}`,
        error,
      );
      this.logger.error(`Error details: ${JSON.stringify(error)}`);
    }
    
    // For single selection role messages, we might want to handle special cases
    if (roleMessageConfig.selectionType === 'single') {
      this.logger.log(
        `This is a single selection role message, handling special unassign logic`,
      );
      
      // For political roles in single selection mode, we might want to do additional cleanup
      // But for now, the existing logic should be sufficient
    }
  }

  private async handleUpdateNickname(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: {
      emoji: string;
      value: string;
      action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' };
    },
  ) {
    this.logger.log(
      `Handling nickname update for ${user.tag} on message ${reaction.message.id}`,
    );

    const guild = reaction.message.guild;
    if (!guild) {
      this.logger.error('Cannot update nickname: Guild not found.');
      return;
    }

    // Determine which part of the nickname to update based on the config ID
    const partType =
      roleMessageConfig.id === 'pronoun-roles' ? 'pronoun' : 'politics';
    this.logger.log(`Updating ${partType} for user ${user.tag}`);

    // Prepare the payload for nickname update
    const payload: UpdateNicknamePayload = {
      userId: user.id,
      guildId: guild.id,
    };

    // Handle based on selection type
    if (roleMessageConfig.selectionType === 'single') {
      // For single selection, directly set the value
      if (partType === 'pronoun') {
        payload.pronoun = roleMapping.value;
      } else {
        payload.politics = roleMapping.value;
      }
    } else {
      // For multiple selection, we would need to append to existing values
      // For now, we'll implement the same behavior as single selection
      // But in the future, this could be extended to support multiple values
      if (partType === 'pronoun') {
        payload.pronoun = roleMapping.value;
      } else {
        payload.politics = roleMapping.value;
      }
    }

    // Dispatch command to update the nickname through the nickname manager
    this.logger.log(`Dispatching nickname update command for user ${user.id}`);
    try {
      await this.swarmService.executeQuery<Promise<void>>(
        'nickname:update',
        payload,
      );
      this.logger.log(
        `Updated nickname for ${user.tag}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update nickname for ${user.tag}`,
        error,
      );
    }
  }

  private async handleRemoveNickname(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: {
      emoji: string;
      value: string;
      action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' };
    },
  ) {
    this.logger.log(
      `Handling nickname removal for ${user.tag} on message ${reaction.message.id}`,
    );

    const guild = reaction.message.guild;
    if (!guild) {
      this.logger.error('Cannot update nickname: Guild not found.');
      return;
    }

    // Determine which part of the nickname to update based on the config ID
    const partType =
      roleMessageConfig.id === 'pronoun-roles' ? 'pronoun' : 'politics';
    this.logger.log(`Removing ${partType} for user ${user.tag}`);

    // Prepare the payload for nickname update
    const payload: UpdateNicknamePayload = {
      userId: user.id,
      guildId: guild.id,
    };

    // Handle based on selection type and part type
    if (roleMessageConfig.selectionType === 'single') {
      // For single selection, we need to check if the current value matches the one being removed
      if (partType === 'pronoun') {
        // For pronouns in single selection mode, unconditionally remove
        payload.pronoun = undefined;
      } else {
        // For politics in single selection mode, check if current value matches
        try {
          const currentParts = await this.swarmService.executeQuery<NicknameParts | undefined>(
            'nickname:getParts',
            { userId: user.id },
          );
          
          // If the current politics value matches the one being removed, set it to undefined
          // Otherwise, keep the current value
          if (currentParts?.politics === roleMapping.value) {
            payload.politics = undefined;
          } else {
            payload.politics = currentParts?.politics;
          }
        } catch (error) {
          this.logger.error(
            `Failed to get current nickname parts for ${user.tag}`,
            error,
          );
          // If we can't get current parts, just remove the politics entirely
          payload.politics = undefined;
        }
      }
    } else {
      // For multiple selection (default behavior), we might want different logic
      // For now, we'll use the same logic as single selection
      if (partType === 'pronoun') {
        payload.pronoun = undefined;
      } else {
        try {
          const currentParts = await this.swarmService.executeQuery<NicknameParts | undefined>(
            'nickname:getParts',
            { userId: user.id },
          );
          
          // If the current politics value matches the one being removed, set it to undefined
          // Otherwise, keep the current value
          if (currentParts?.politics === roleMapping.value) {
            payload.politics = undefined;
          } else {
            payload.politics = currentParts?.politics;
          }
        } catch (error) {
          this.logger.error(
            `Failed to get current nickname parts for ${user.tag}`,
            error,
          );
          // If we can't get current parts, just remove the politics entirely
          payload.politics = undefined;
        }
      }
    }

    // Dispatch command to update the nickname through the nickname manager
    this.logger.log(`Dispatching nickname removal command for user ${user.id}`);
    try {
      await this.swarmService.executeQuery<Promise<void>>(
        'nickname:update',
        payload,
      );
      this.logger.log(
        `Removed ${partType} from nickname for ${user.tag}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to remove ${partType} from nickname for ${user.tag}`,
        error,
      );
    }
  }

  /**
   * Sets the channel ID for a specific channel type in a guild
   * This configuration is stored in the database and will persist across restarts
   * @param guildId The ID of the guild
   * @param channelType The type of channel (e.g., 'roles', 'admin')
   * @param channelId The Discord channel ID
   */
  async setGuildChannel(guildId: string, channelType: string, channelId: string): Promise<void> {
    this.logger.log(`Setting channel for guild ${guildId}: ${channelType} = ${channelId}`);
    
    // Update our in-memory cache
    if (!this.guildChannels[guildId]) {
      this.guildChannels[guildId] = {};
    }
    this.guildChannels[guildId][channelType] = channelId;
    
    // Save to database
    return new Promise((resolve) => {
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: 'guildChannels',
          data: this.guildChannels,
          onSave: () => {
            this.logger.log(`Saved guild channel configuration for guild ${guildId}`);
            resolve();
          },
        },
      });
    });
  }
}
