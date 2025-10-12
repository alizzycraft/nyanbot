import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// Import the new nanite modules
import { DiscordNaniteModule } from './nanites/discord/discord.module';
import { LoggerNaniteModule } from './nanites/logger/logger.module';
import { PersistenceNaniteModule } from './nanites/persistence/persistence.module';
import { AdminNaniteModule } from './nanites/admin/admin.module';
import { ReactionRoleNaniteModule } from './nanites/reaction-role/reaction-role.module';
// Import the modules that still contain services we haven't refactored yet
import { RoleMessageModule } from './role-message/role-message.module';
import { BotCommandModule } from './bot-command/bot-command.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Core nanite modules
    DiscordNaniteModule,
    LoggerNaniteModule,
    PersistenceNaniteModule,
    // Business logic nanite modules
    AdminNaniteModule,
    ReactionRoleNaniteModule,
    // Modules with services not yet refactored
    RoleMessageModule,
    BotCommandModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
