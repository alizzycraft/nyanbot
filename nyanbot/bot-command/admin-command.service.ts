import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { DiscordService } from '../discord/discord.service';
import { RoleMessageConfig } from '../role-message/interfaces/role-message.interface';
import { RoleMessageStateService, PostedRoleMessage } from '../role-message/role-message-state.service';
import { filter, tap, switchMap, catchError, map } from 'rxjs/operators';
import { forkJoin, from } from 'rxjs';
import { TextChannel, Guild, GuildMember, PermissionsBitField } from 'discord.js';
import { channelConfig, ChannelConfig } from '../discord/channel.config';

@Injectable()
export class AdminCommandService implements OnModuleInit {
  private readonly logger = new Logger(AdminCommandService.name);

  constructor(
    private discordService: DiscordService,
    private roleMessageStateService: RoleMessageStateService,
    @Inject(channelConfig.KEY) private channels: ConfigType<typeof channelConfig>,
    @Inject('ROLE_MESSAGE_CONFIGS') private roleMessageConfigs: RoleMessageConfig[],
  ) {}

  onModuleInit() {
    this.discordService.onMessageCreate().pipe(
      filter(message => message.channel.id === this.channels.admin), // Listen only in admin channel
      filter(message => message.content.startsWith('!nyan')), // Bot's command prefix
      filter(message => !message.author.bot), // Ignore bot's own messages
      filter(message => this.isAdmin(message.member)), // Check if sender is admin
      switchMap(message => {
        const command = message.content.slice('!nyan'.length).trim();
        if (command === 'post-roles') {
          this.logger.log(`Admin ${message.author.tag} triggered 'post-roles' command.`);
          message.reply('Clearing old role messages and posting new ones...');
          this.roleMessageStateService.clearState();
          return this.postAllRoleMessages(message.guild);
        }
        // Add other admin commands here
        return from([]); // Return empty observable for unhandled commands
      }),
      catchError((err, caught) => {
        this.logger.error('Error in AdminCommandService:', err);
        // You might want to reply to the admin channel with the error
        return caught; // Resubscribe to continue listening for commands
      })
    ).subscribe();
  }

  private isAdmin(member: GuildMember | null): boolean {
    if (!member) return false;
    // For MVP, check if the user has ADMINISTRATOR permission
    // In a real bot, you'd likely have a dedicated admin role ID
    return member.permissions.has(PermissionsBitField.Flags.Administrator);
  }

  private postAllRoleMessages(guild: Guild | null) {
    if (!guild) {
      this.logger.error('Cannot post role messages: Guild not found.');
      return from([]);
    }

    const postTasks = this.roleMessageConfigs.map(config => {
      const channelId = this.channels[config.channel as keyof ChannelConfig];
      if (!channelId || typeof channelId !== 'string') {
        this.logger.warn(`Channel key '${config.channel}' not found or is not a single ID in config for message: ${config.id}. Skipping.`);
        return from([]);
      }

      return from(this.discordService.getTextChannel(channelId)).pipe(
        switchMap(channel => {
          if (!channel) {
            this.logger.warn(`Channel not found for ID: ${channelId} (Key: ${config.channel}). Skipping.`);
            return from([]); // Skip this config if channel not found
          }
          return from(channel.send(config.content)).pipe(
            switchMap(message => {
              this.logger.log(`Posted role message for '${config.id}' in #${channel.name}`);
              const posted: PostedRoleMessage = {
                configId: config.id,
                guildId: guild.id,
                channelId: channel.id,
                messageId: message.id,
                postedAt: new Date(),
              };
              this.roleMessageStateService.addPostedMessage(posted);

              // Add reactions
              const reactionPromises = config.reactions.map(r => message.react(r.emoji));
              return forkJoin(reactionPromises).pipe(
                tap(() => this.logger.debug(`Added reactions for '${config.id}' message.`)),
                map(() => message) // Pass the message along
              );
            }),
            catchError(err => {
              this.logger.error(`Failed to post/react for config ${config.id}: ${err.message}`);
              return from([]);
            })
          );
        }),
        catchError(err => {
            this.logger.error(`Error processing role message config ${config.id}: ${err.message}`);
            return from([]);
        })
      );
    });
    return forkJoin(postTasks);
  }
}
