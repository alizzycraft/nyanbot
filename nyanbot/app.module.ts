import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DiscordModule } from './discord/discord.module';
import { BotCommandModule } from './bot-command/bot-command.module';
import { RoleMessageModule } from './role-message/role-message.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DiscordModule,
    BotCommandModule,
    RoleMessageModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
