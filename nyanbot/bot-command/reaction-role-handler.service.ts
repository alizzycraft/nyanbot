import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DiscordService } from '../discord/discord.service';
import { RoleMessageStateService } from '../role-message/role-message-state.service';
import { RoleMessageConfig } from '../role-message/interfaces/role-message.interface';
import { filter, switchMap, map, catchError, tap } from 'rxjs/operators';
import {
  Guild,
  GuildMember,
  RoleResolvable,
  PartialMessageReaction,
  MessageReaction,
  User,
  PartialUser,
} from 'discord.js';
import { from, Subscription } from 'rxjs';
import { NicknameStateService } from './nickname-state.service';

@Injectable()
export class ReactionRoleHandlerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReactionRoleHandlerService.name);
  private reactionAddSubscription: Subscription;
  private readySubscription: Subscription;

  constructor(
    private discordService: DiscordService,
    private roleMessageStateService: RoleMessageStateService,
    private nicknameStateService: NicknameStateService,
    @Inject('ROLE_MESSAGE_CONFIGS')
    private roleMessageConfigs: RoleMessageConfig[],
  ) {}

  onModuleInit() {
    this.readySubscription = this.discordService.onClientReady().subscribe(() => {
      this.logger.log('Discord client is ready, setting up reaction listener.');
      this.setupReactionListener();
    });
  }

  onModuleDestroy() {
    if (this.readySubscription) {
      this.readySubscription.unsubscribe();
    }
    if (this.reactionAddSubscription) {
      this.reactionAddSubscription.unsubscribe();
    }
  }

  private setupReactionListener() {
    if (this.reactionAddSubscription) {
      this.reactionAddSubscription.unsubscribe();
    }
    this.reactionAddSubscription = this.discordService
      .onMessageReactionAdd()
      .pipe(
        tap(([reaction, user]) => {
          this.logger.log(`Reaction added by ${user.tag} on message ${reaction.message.id}`);
        }),
        filter(([reaction, user]) => !user.bot),
        switchMap(([reaction, user]) => {
          return from(
            Promise.all([
              reaction.fetch().catch(() => reaction as unknown as PartialMessageReaction),
              user.fetch().catch(() => user as unknown as PartialUser),
            ]),
          ).pipe(
            map(([fullReaction, fullUser]) => ({ fullReaction, fullUser })),
            filter(({ fullReaction }) => !!fullReaction.message.id),
            filter(
              ({ fullReaction }) =>
                this.roleMessageStateService.getPostedMessageByMessageId(
                  fullReaction.message.id,
                ) !== undefined,
            ),
            tap(({ fullReaction }) => {
              this.logger.log(`Processing reaction on message ${fullReaction.message.id}`);
            }),
            switchMap(({ fullReaction, fullUser }) => {
              const postedMessage = this.roleMessageStateService.getPostedMessageByMessageId(
                fullReaction.message.id,
              )!;
              const config = this.roleMessageConfigs.find(
                (c) => c.id === postedMessage.configId,
              )!;

              if (!config || !fullReaction.message.guild) {
                this.logger.warn(
                  `Config or guild not found for reaction on message ${fullReaction.message.id}`,
                );
                return from([]);
              }

              return this.handleReactionAction(
                fullReaction,
                fullUser,
                config,
                fullReaction.message.guild,
              );
            }),
            catchError((err) => {
              this.logger.error('Error in ReactionRoleHandlerService:', err);
              return from([]);
            }),
          );
        }),
      )
      .subscribe();
  }

  private async handleReactionAction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    config: RoleMessageConfig,
    guild: Guild,
  ) {
    const guildMember = await guild.members.fetch(user.id);
    if (!guildMember) {
      this.logger.warn(
        `Could not find guild member for user ${user.id} in guild ${guild.id}`,
      );
      return;
    }

    const emoji = reaction.emoji.name;
    const mapping = config.reactions.find((r) => r.emoji === emoji);
    if (!mapping) return;

    switch (config.action.type) {
      case 'ASSIGN_ROLE':
        await this.toggleRole(guildMember, mapping.value, guild);
        break;
      case 'UPDATE_NICKNAME':
        const currentParts = this.nicknameStateService.getNicknameParts(user.id) || {};
        let newValue: string | undefined = mapping.value;

        if (config.id === 'pronoun-roles') {
          if (currentParts.pronoun === mapping.value) {
            newValue = undefined; // Toggle off
          }
          this.nicknameStateService.updatePronoun(user.id, newValue);
        } else if (config.id === 'political-leaning-roles') {
          if (currentParts.politics === mapping.value) {
            newValue = undefined; // Toggle off
          }
          this.nicknameStateService.updatePolitics(user.id, newValue);
        }
        await this.updateNickname(guildMember);
        break;
      default:
        this.logger.warn(`Unknown action type for config: ${config.id}`);
    }
  }

  private async toggleRole(
    member: GuildMember,
    roleName: string,
    guild: Guild,
  ) {
    const role = guild.roles.cache.find((r) => r.name === roleName);
    if (!role) {
      this.logger.error(
        `Role '${roleName}' not found in guild '${guild.name}'. Please create it.`,
      );
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role as RoleResolvable);
      this.logger.log(`Removed role ${role.name} from ${member.user.tag}.`);
    } else {
      await member.roles.add(role as RoleResolvable);
      this.logger.log(`Added role ${role.name} to ${member.user.tag}.`);
    }
  }

  private async updateNickname(member: GuildMember) {
    const nicknameParts = this.nicknameStateService.getNicknameParts(member.id);
    const baseNickname = member.user.displayName;

    let newNickname = baseNickname;

    if (nicknameParts?.pronoun) {
      newNickname += ` (${nicknameParts.pronoun})`;
    }
    if (nicknameParts?.politics) {
      newNickname += ` [${nicknameParts.politics}]`;
    }

    if (newNickname.length > 32) {
      this.logger.warn(
        `New nickname for ${member.user.tag} is too long: ${newNickname}`,
      );
      newNickname = newNickname.substring(0, 32);
    }

    try {
      // Only set the nickname if it has changed
      if (member.nickname !== newNickname) {
        await member.setNickname(newNickname);
        this.logger.log(`Set nickname for ${member.user.tag} to \'${newNickname}\'`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to set nickname for ${member.user.tag}. Missing Permissions?`,
        error,
      );
    }
  }
}