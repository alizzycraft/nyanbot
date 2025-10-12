import { Injectable, Logger, Inject } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs';
import {
  isDiscordMessageReactionAddCommand,
  isDiscordMessageReactionRemoveCommand,
  isDiscordSetNicknameCommand,
  DISCORD_NANITE_COMMAND_SET_NICKNAME,
} from '../discord/discord.interface';
import { RoleMessageConfig } from '../../role-message/interfaces/role-message.interface';
import {
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
} from 'discord.js';
import { NicknameStateService } from '../../bot-command/nickname-state.service';
import { RoleMessageStateService } from '../../role-message/role-message-state.service';

@Injectable()
export class ReactionRoleNanite {
  private readonly logger = new Logger(ReactionRoleNanite.name);

  constructor(
    private readonly swarmService: SwarmService,
    private readonly nicknameStateService: NicknameStateService,
    private readonly roleMessageStateService: RoleMessageStateService,
    @Inject('ROLE_MESSAGE_CONFIGS')
    private roleMessageConfigs: RoleMessageConfig[],
  ) {
    this.logger.log('ReactionRoleNanite instantiated');

    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageReactionAddCommand))
      .subscribe(({ payload }) => {
        this.logger.debug('Reaction added');
        void this.handleAddRole(payload.reaction, payload.user);
      });

    this.swarmService.commandQueue$
      .pipe(filter(isDiscordMessageReactionRemoveCommand))
      .subscribe(({ payload }) => {
        this.logger.debug('Reaction removed');
        void this.handleRemoveRole(payload.reaction, payload.user);
      });
  }

  private async handleAddRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) {
    this.logger.log(
      `Handling role addition for ${user.tag} on message ${reaction.message.id}`,
    );
    
    // Find the posted message to get the config ID
    const postedMessage = this.roleMessageStateService.getPostedMessageByMessageId(
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
    this.logger.log(`Action type for reaction ${reaction.emoji.name}: ${actionType}`);
    
    if (actionType === 'UPDATE_NICKNAME' || actionType === 'BOTH') {
      this.logger.log(`Calling handleUpdateNickname for ${user.tag}`);
      await this.handleUpdateNickname(reaction, user, roleMessageConfig, roleMapping);
    }
    
    if (actionType === 'ASSIGN_ROLE' || actionType === 'BOTH') {
      this.logger.log(`Calling handleAssignRole for ${user.tag}`);
      await this.handleAssignRole(reaction, user, roleMessageConfig, roleMapping);
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
    const postedMessage = this.roleMessageStateService.getPostedMessageByMessageId(
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
    this.logger.log(`Action type for reaction ${reaction.emoji.name}: ${actionType}`);
    
    if (actionType === 'UPDATE_NICKNAME' || actionType === 'BOTH') {
      this.logger.log(`Calling handleRemoveNickname for ${user.tag}`);
      await this.handleRemoveNickname(reaction, user, roleMessageConfig, roleMapping);
    }
    
    if (actionType === 'ASSIGN_ROLE' || actionType === 'BOTH') {
      this.logger.log(`Calling handleUnassignRole for ${user.tag}`);
      await this.handleUnassignRole(reaction, user, roleMessageConfig, roleMapping);
    }
  }

  private async handleAssignRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: { emoji: string; value: string; action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' } },
  ) {
    this.logger.log(`handleAssignRole called for user ${user.tag} with value ${roleMapping.value}`);
    
    // Only proceed with role assignment if the action type is ASSIGN_ROLE or BOTH
    if (roleMapping.action.type !== 'ASSIGN_ROLE' && roleMapping.action.type !== 'BOTH') {
      this.logger.log(`Skipping role assignment for ${roleMapping.value} because action type is ${roleMapping.action.type}`);
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
      'L': 'Left',
      'CL': 'Center-Left',
      'C': 'Center',
      'CR': 'Center-Right',
      'R': 'Right'
    };
    
    // Get the full role name, or use the value directly if not in the mapping (for pronouns)
    const fullRoleName = roleAbbreviationToFullName[roleMapping.value] || roleMapping.value;
    this.logger.log(`Looking for role with full name '${fullRoleName}' (case-insensitive) for value '${roleMapping.value}'`);
    
    // Check if role exists by name (case-insensitive)
    const role = guild.roles.cache.find(
      r => r.name.toLowerCase() === fullRoleName.toLowerCase()
    );
    
    if (role) {
      this.logger.log(`Found existing role: ${role.name} (${role.id})`);
    } else {
      this.logger.log(`Role ${fullRoleName} not found, will create it`);
    }

    // If this is a political role, remove any other political roles the user might have
    if (roleAbbreviationToFullName[roleMapping.value]) {
      this.logger.log(`This is a political role, removing other political roles for user ${user.tag}`);
      const politicalRoleNames = Object.values(roleAbbreviationToFullName);
      
      // Get all political roles in the guild
      const politicalRoles = guild.roles.cache.filter(role => 
        politicalRoleNames.some(name => role.name.toLowerCase() === name.toLowerCase())
      );
      
      // Remove any political roles the user currently has
      for (const [roleId, politicalRole] of politicalRoles) {
        if (member.roles.cache.has(roleId)) {
          try {
            this.logger.log(`Removing existing political role ${politicalRole.name} from ${user.tag}`);
            await member.roles.remove(roleId);
            this.logger.log(`Removed political role ${politicalRole.name} from ${user.tag}`);
          } catch (error) {
            this.logger.error(`Failed to remove political role ${politicalRole.name} from ${user.tag}`, error);
          }
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
        this.logger.log(`Adding existing role ${role.name} (${role.id}) to ${user.tag} (${member.id})`);
        this.logger.log(`Bot's highest role position: ${guild.members.me?.roles.highest.position}`);
        this.logger.log(`Target role position: ${role.position}`);
        await member.roles.add(role.id);
        this.logger.log(`Added role ${role.name} to ${user.tag}`);
      } catch (error) {
        this.logger.error(`Failed to add role ${role.name} to ${user.tag}`, error);
        this.logger.error(`Error details: ${JSON.stringify(error)}`);
      }
    }
  }

  private async handleUnassignRole(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: { emoji: string; value: string; action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' } },
  ) {
    this.logger.log(`handleUnassignRole called for user ${user.tag} with value ${roleMapping.value}`);
    
    // Only proceed with role unassignment if the action type is ASSIGN_ROLE or BOTH
    if (roleMapping.action.type !== 'ASSIGN_ROLE' && roleMapping.action.type !== 'BOTH') {
      this.logger.log(`Skipping role unassignment for ${roleMapping.value} because action type is ${roleMapping.action.type}`);
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
      'L': 'Left',
      'CL': 'Center-Left',
      'C': 'Center',
      'CR': 'Center-Right',
      'R': 'Right'
    };
    
    // Get the full role name, or use the value directly if not in the mapping (for pronouns)
    const fullRoleName = roleAbbreviationToFullName[roleMapping.value] || roleMapping.value;
    this.logger.log(`Looking for role with full name '${fullRoleName}' (case-insensitive) for value '${roleMapping.value}'`);

    // Check if role exists by name (case-insensitive)
    const role = guild.roles.cache.find(
      r => r.name.toLowerCase() === fullRoleName.toLowerCase()
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
      this.logger.error(`Failed to remove role ${role.name} from ${user.tag}`, error);
      this.logger.error(`Error details: ${JSON.stringify(error)}`);
    }
  }

  private async handleUpdateNickname(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: { emoji: string; value: string; action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' } },
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
    const partType = roleMessageConfig.id === 'pronoun-roles' ? 'pronoun' : 'politics';
    this.logger.log(`Updating ${partType} for user ${user.tag}`);
    
    // Update the nickname state
    if (partType === 'pronoun') {
      this.logger.log(`Calling updatePronoun for user ${user.id} with value ${roleMapping.value}`);
      this.nicknameStateService.updatePronoun(user.id, roleMapping.value);
    } else {
      this.logger.log(`Calling updatePolitics for user ${user.id} with value ${roleMapping.value}`);
      this.nicknameStateService.updatePolitics(user.id, roleMapping.value);
    }

    // Add a small delay to ensure the state is saved before reading it
    this.logger.log(`Waiting for state to be saved before reading...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    this.logger.log(`Done waiting for state to be saved.`);

    // Get current nickname parts
    this.logger.log(`Getting nickname parts for user ${user.id}`);
    const nicknameParts = this.nicknameStateService.getNicknameParts(user.id) || {};
    this.logger.log(`Current nickname parts: ${JSON.stringify(nicknameParts)}`);
    
    // Build the nickname suffix in the format "(pronouns)[politics]"
    let nicknameSuffix = '';
    if (nicknameParts.pronoun || nicknameParts.politics) {
      // Add a space before the suffixes
      nicknameSuffix = ' ';
      
      // Only add parentheses if there are pronouns
      if (nicknameParts.pronoun) {
        nicknameSuffix += '(' + nicknameParts.pronoun + ')';
      }
      
      // Add politics in brackets if present
      if (nicknameParts.politics) {
        nicknameSuffix += '[' + nicknameParts.politics + ']';
      }
    }

    this.logger.log(`Built nickname suffix: '${nicknameSuffix}'`);

    // Dispatch command to update the user's nickname
    this.logger.log(`Dispatching nickname update command for user ${user.id}`);
    this.swarmService.dispatch({
      type: DISCORD_NANITE_COMMAND_SET_NICKNAME,
      payload: {
        userId: user.id,
        guildId: guild.id,
        nickname: nicknameSuffix,
      },
    });

    this.logger.log(`Updated nickname for ${user.tag} with suffix: ${nicknameSuffix}`);
  }

  private async handleRemoveNickname(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    roleMessageConfig: RoleMessageConfig,
    roleMapping: { emoji: string; value: string; action: { type: 'ASSIGN_ROLE' | 'UPDATE_NICKNAME' | 'BOTH' } },
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
    const partType = roleMessageConfig.id === 'pronoun-roles' ? 'pronoun' : 'politics';
    this.logger.log(`Removing ${partType} for user ${user.tag}`);
    
    // Update the nickname state (set to undefined to remove)
    if (partType === 'pronoun') {
      this.logger.log(`Calling updatePronoun for user ${user.id} with value undefined`);
      this.nicknameStateService.updatePronoun(user.id, undefined);
    } else {
      this.logger.log(`Calling updatePolitics for user ${user.id} with value undefined`);
      this.nicknameStateService.updatePolitics(user.id, undefined);
    }

    // Add a small delay to ensure the state is saved before reading it
    this.logger.log(`Waiting for state to be saved before reading...`);
    await new Promise(resolve => setTimeout(resolve, 500));
    this.logger.log(`Done waiting for state to be saved.`);

    // Get current nickname parts
    this.logger.log(`Getting nickname parts for user ${user.id}`);
    const nicknameParts = this.nicknameStateService.getNicknameParts(user.id) || {};
    this.logger.log(`Current nickname parts after removal: ${JSON.stringify(nicknameParts)}`);
    
    // Build the nickname suffix in the format "(pronouns)[politics]"
    let nicknameSuffix = '';
    if (nicknameParts.pronoun || nicknameParts.politics) {
      // Add a space before the suffixes
      nicknameSuffix = ' ';
      
      // Only add parentheses if there are pronouns
      if (nicknameParts.pronoun) {
        nicknameSuffix += '(' + nicknameParts.pronoun + ')';
      }
      
      // Add politics in brackets if present
      if (nicknameParts.politics) {
        nicknameSuffix += '[' + nicknameParts.politics + ']';
      }
    }

    this.logger.log(`Built nickname suffix after removal: '${nicknameSuffix}'`);

    // Dispatch command to update the user's nickname
    this.logger.log(`Dispatching nickname update command for user ${user.id}`);
    this.swarmService.dispatch({
      type: DISCORD_NANITE_COMMAND_SET_NICKNAME,
      payload: {
        userId: user.id,
        guildId: guild.id,
        nickname: nicknameSuffix,
      },
    });

    this.logger.log(`Updated nickname for ${user.tag} with suffix: ${nicknameSuffix}`);
  }
}