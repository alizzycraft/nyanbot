import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, GatewayIntentBits, Message, MessageReaction, User, TextChannel, Partials } from 'discord.js';
import { fromEvent, Observable } from 'rxjs';

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly client: Client;
  private readonly logger = new Logger(DiscordService.name);

  constructor(private configService: ConfigService) {
    this.logger.log('DiscordService instantiated');
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
      this.logger.error('Discord bot token not found in environment variables!');
      return;
    }
    this.client.on('debug', (message) => {
      this.logger.debug(message);
    });
    this.client.on('shardError', (error) => {
      this.logger.error('A shard encountered an error:', error);
    });
    this.client.on('clientReady', () => {
      this.logger.log(`NyanBot logged in as ${this.client.user?.tag}`);
    });
    await this.client.login(token);
  }

  getClient(): Client {
    return this.client;
  }

  // Reactive Streams for Discord Events
  onClientReady(): Observable<Client> {
    return fromEvent(this.client, 'clientReady') as Observable<Client>;
  }
  
  onMessageCreate(): Observable<Message> {
    return fromEvent(this.client, 'messageCreate') as Observable<Message>;
  }

  onMessageReactionAdd(): Observable<[MessageReaction, User]> {
    return fromEvent(this.client, 'messageReactionAdd') as Observable<[MessageReaction, User]>;
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
      this.logger.error(`Failed to fetch channel ${channelId}: ${error.message}`);
      return null;
    }
  }
}