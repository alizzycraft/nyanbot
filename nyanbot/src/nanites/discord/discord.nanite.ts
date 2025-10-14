import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  GatewayIntentBits,
  Message,
  Partials,
  TextChannel,
  MessageReaction,
  User,
  PartialMessageReaction,
  PartialUser,
} from 'discord.js';
import { SwarmService } from '../../swarm/swarm.service';
import {
  DISCORD_NANITE_EVENT_MESSAGE_CREATE,
  DISCORD_NANITE_EVENT_MESSAGE_REACTION_ADD,
  DISCORD_NANITE_EVENT_MESSAGE_REACTION_REMOVE,
  isDiscordSendMessageCommand,
  isDiscordSetNicknameCommand,
} from '@nanorepo/commands/discord.commands';
import { filter } from 'rxjs';

@Injectable()
export class DiscordNanite implements OnModuleInit {
  private readonly client: Client;
  private readonly logger = new Logger(DiscordNanite.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly swarmService: SwarmService,
  ) {
    this.logger.log(`DiscordNanite instantiated with PID ${process.pid}`);
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
  }

  async onModuleInit() {
    const token = this.configService.get<string>('DISCORD_BOT_TOKEN');
    if (!token) {
      this.logger.error(
        'Discord bot token not found in environment variables!',
      );
      return;
    }

    // --- Register Event Listeners to push to Swarm ---
    this.client.on('messageCreate', (message) => {
      this.logger.debug(
        `Received message from ${message.author.tag} in channel ${message.channel.id}: ${message.content}`,
      );
      if (message.author.bot) {
        this.logger.debug('Ignoring bot message');
        return;
      }
      this.logger.log(
        `Dispatching messageCreate event for message from ${message.author.tag} (PID: ${process.pid})`,
      );
      this.swarmService.dispatch({
        type: DISCORD_NANITE_EVENT_MESSAGE_CREATE,
        payload: message,
      });
    });

    this.client.on('messageReactionAdd', (reaction, user) => {
      this.logger.debug(
        `Received reaction ${reaction.emoji.name} from ${user.tag} on message ${reaction.message.id}`,
      );
      if (user.bot) {
        this.logger.debug('Ignoring bot reaction');
        return;
      }
      // When a reaction is received, fetch the full reaction object if it's partial
      void this.fetchAndDispatchReaction(
        reaction,
        user,
        DISCORD_NANITE_EVENT_MESSAGE_REACTION_ADD,
      );
    });

    this.client.on('messageReactionRemove', (reaction, user) => {
      this.logger.debug(
        `Received reaction removal ${reaction.emoji.name} from ${user.tag} on message ${reaction.message.id}`,
      );
      if (user.bot) {
        this.logger.debug('Ignoring bot reaction removal');
        return;
      }
      // When a reaction is removed, fetch the full reaction object if it's partial
      void this.fetchAndDispatchReaction(
        reaction,
        user,
        DISCORD_NANITE_EVENT_MESSAGE_REACTION_REMOVE,
      );
    });

    this.client.on('debug', (message) => this.logger.debug(message));
    this.client.on('shardError', (error) =>
      this.logger.error('A shard encountered an error:', error),
    );
    this.client.once('clientReady', async () => {
      this.logger.log(`NyanBot logged in as ${this.client.user?.tag} with PID ${process.pid}`);
      
      // Fetch guild and channel information
      const guilds = this.client.guilds.cache.map((guild) => guild.id);
      
      // Try to load guild channel configurations from AceBase
      const guildChannels: Record<string, Record<string, string>> = {};
      let adminChannelId: string | undefined;
      
      try {
        // Request guild channel configurations from the persistence system
        const savedGuildChannels = await this.swarmService.executeQuery<
          Promise<Record<string, Record<string, string>>>
        >('persistence:getState', 'guildChannels');
        
        if (savedGuildChannels) {
          Object.assign(guildChannels, savedGuildChannels);
          this.logger.log(`Loaded guild channel configurations from database: ${JSON.stringify(guildChannels)}`);
        } else {
          this.logger.log('No guild channel configurations found in database');
        }
        
        // Load admin channel configuration
        const savedAdminChannel = await this.swarmService.executeQuery<
          Promise<string | undefined>
        >('persistence:getState', 'adminChannel');
        
        if (savedAdminChannel) {
          adminChannelId = savedAdminChannel;
          this.logger.log(`Loaded admin channel from database: ${adminChannelId}`);
        } else {
          this.logger.log('No admin channel configuration found in database');
        }
      } catch (error) {
        this.logger.warn('Failed to load channel configurations from database:', error);
      }
      
      this.swarmService.dispatch({
        type: 'discord:ready',
        payload: { 
          guilds, 
          guildChannels,
          adminChannelId 
        },
      });
    });

    // --- Subscribe to Swarm Commands ---
    this.swarmService.commandQueue$
      .pipe(filter(isDiscordSendMessageCommand))
      .subscribe(({ payload }) => {
        this.logger.debug(
          `Sending message to channel ${payload.channelId}: ${payload.message}`,
        );
        void this.sendMessage(
          payload.channelId,
          payload.message,
          payload.onSent,
        );
      });

    this.swarmService.commandQueue$
      .pipe(filter(isDiscordSetNicknameCommand))
      .subscribe(({ payload }) => {
        this.logger.debug(
          `Setting nickname for user ${payload.userId} in guild ${payload.guildId} to ${payload.nickname}`,
        );
        void this.setNickname(
          payload.userId,
          payload.guildId,
          payload.nickname,
        );
      });

    this.swarmService.commandQueue$
      .pipe(filter((command: any) => command.type === 'discord:addReaction'))
      .subscribe(({ payload }) => {
        this.logger.debug(
          `Adding reaction ${payload.emoji} to message ${payload.message.id}`,
        );
        void payload.message.react(payload.emoji);
      });

    this.swarmService.registerQueryHandler(
      'discord:getMessage',
      async (payload: { channelId: string; messageId: string }) => {
        try {
          const channel = await this.client.channels.fetch(payload.channelId);
          if (channel?.isTextBased()) {
            const message = await (channel as TextChannel).messages.fetch(
              payload.messageId,
            );
            return message;
          }
        } catch (error) {
          return null;
        }
        return null;
      },
    );

    await this.client.login(token);
    this.logger.log('DiscordNanite initialized');
  }

  private async fetchAndDispatchReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    eventType: string,
  ) {
    this.logger.debug('Fetching and dispatching reaction');
    // When a reaction is received, fetch the full reaction object if it's partial
    if (reaction.partial) {
      try {
        await reaction.fetch();
        this.logger.debug('Fetched partial reaction');
      } catch (error) {
        this.logger.error(
          'Something went wrong when fetching the message:',
          error as Error,
        );
        return;
      }
    }
    this.logger.log(
      `Dispatching ${eventType} event for reaction ${reaction.emoji.name} from ${user.tag}`,
    );
    this.swarmService.dispatch({
      type: eventType,
      payload: { reaction, user },
    });
  }

  private async sendMessage(
    channelId: string,
    message: string,
    onSent?: (message: Message) => void,
  ): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        const sentMessage = await (channel as TextChannel).send(message);
        if (onSent) {
          onSent(sentMessage);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to send message to channel ${channelId}`,
        error as Error,
      );
    }
  }

  private async setNickname(
    userId: string,
    guildId: string,
    nicknameSuffix: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Attempting to set nickname for user ${userId} in guild ${guildId} with suffix '${nicknameSuffix}'`,
      );

      const guild = await this.client.guilds.fetch(guildId);
      if (!guild) {
        this.logger.error(`Guild not found: ${guildId}`);
        return;
      }

      const member = await guild.members.fetch(userId);
      if (!member) {
        this.logger.error(`Member not found: ${userId}`);
        return;
      }

      // Get the user's base display name
      const baseDisplayName = member.user.displayName;
      this.logger.log(
        `Base display name for ${member.user.tag}: '${baseDisplayName}'`,
      );
      this.logger.log(
        `Username for ${member.user.tag}: '${member.user.username}'`,
      );
      this.logger.log(
        `Current nickname for ${member.user.tag}: '${member.nickname || '(default)'}'`,
      );

      // If suffix is empty, reset to default nickname
      if (!nicknameSuffix) {
        this.logger.log(`Resetting nickname for ${member.user.tag} to default`);
        // Check if already at default
        if (!member.nickname) {
          this.logger.log(
            `Nickname for ${member.user.tag} is already default, no change needed`,
          );
          return;
        }
        this.logger.log(
          `Current nickname: '${member.nickname}', Resetting to default (empty)`,
        );
        await member.setNickname('');
        this.logger.log(`Reset nickname for ${member.user.tag} to default`);
        return;
      }

      // Construct the full nickname by appending the suffix to the base display name
      let finalNickname = baseDisplayName + nicknameSuffix;
      this.logger.log(`Constructed nickname: '${finalNickname}'`);

      // Ensure nickname isn't too long (Discord limit is 32 characters)
      if (finalNickname.length > 32) {
        // Truncate the base name to fit the suffix
        const availableLength = 32 - nicknameSuffix.length;
        if (availableLength > 0) {
          finalNickname =
            baseDisplayName.substring(0, availableLength) + nicknameSuffix;
        } else {
          // If suffix alone is too long, just use part of it
          finalNickname = nicknameSuffix.substring(0, 32);
        }
        this.logger.log(
          `Truncated nickname to fit Discord limit: '${finalNickname}'`,
        );
      }

      this.logger.log(
        `Setting nickname for ${member.user.tag} to '${finalNickname}'`,
      );

      // Check if the nickname is actually changing
      const currentNickname = member.nickname || '';
      if (currentNickname === finalNickname) {
        this.logger.log(
          `Nickname for ${member.user.tag} is already '${finalNickname}', no change needed`,
        );
        return;
      }

      this.logger.log(
        `Current nickname: '${currentNickname}', New nickname: '${finalNickname}'`,
      );

      this.logger.log(
        `Setting nickname for ${member.user.tag} to '${finalNickname}'`,
      );

      await member.setNickname(finalNickname);
      this.logger.log(
        `Set nickname for ${member.user.tag} to '${finalNickname}'`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set nickname for user ${userId}`,
        error as Error,
      );
      this.logger.error(`Error details: ${JSON.stringify(error)}`);

      // Log additional context
      this.logger.error(
        `User: ${userId}, Guild: ${guildId}, Suffix: '${nicknameSuffix}'`,
      );
    }
  }

  // Utility to get a channel
  async getTextChannel(channelId: string): Promise<TextChannel | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        return channel as TextChannel;
      }
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to fetch channel ${channelId}:`,
        error as Error,
      );
      return null;
    }
  }

  getClient(): Client {
    return this.client;
  }
}
