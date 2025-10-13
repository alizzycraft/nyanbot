import { Injectable, Logger } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { NicknameParts, UpdateNicknamePayload, GetNicknamePartsPayload } from './nickname-manager.interface';

@Injectable()
export class NicknameManagerNanite {
  private readonly logger = new Logger(NicknameManagerNanite.name);

  constructor(private readonly swarmService: SwarmService) {
    this.logger.log('NicknameManagerNanite initialized');
    
    // Register query handlers
    this.swarmService.registerQueryHandler(
      'nickname:update',
      async (payload: UpdateNicknamePayload) => {
        return this.updateNickname(payload);
      },
    );
    
    this.swarmService.registerQueryHandler(
      'nickname:getParts',
      async (payload: GetNicknamePartsPayload) => {
        return this.getNicknameParts(payload.userId);
      },
    );
  }

  async getNicknameParts(userId: string): Promise<NicknameParts | undefined> {
    try {
      this.logger.log(`Getting nickname parts for user ${userId}`);
      const result = await this.swarmService.executeQuery<Promise<NicknameParts | undefined>>(
        'persistence:getState',
        `nickname:${userId}`,
      );
      this.logger.log(
        `Retrieved nickname parts for user ${userId}: ${JSON.stringify(result)}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get nickname parts for user ${userId}`,
        error,
      );
      return undefined;
    }
  }

  async updateNickname(payload: UpdateNicknamePayload): Promise<void> {
    const { userId, guildId, pronoun, politics } = payload;
    
    try {
      this.logger.log(`Updating nickname for user ${userId}`);
      this.logger.log(`Pronoun: ${pronoun}, Politics: ${politics}`);
      
      // Get current nickname parts
      const currentParts = (await this.getNicknameParts(userId)) || {};
      this.logger.log(
        `Current parts for user ${userId}: ${JSON.stringify(currentParts)}`,
      );
      
      // Merge with new values
      const newParts: NicknameParts = { ...currentParts };
      
      // Handle pronoun update/removal
      if (payload.hasOwnProperty('pronoun')) {
        // If pronoun property is present (even if undefined), explicitly set it
        newParts.pronoun = pronoun || undefined; // Empty string becomes undefined
      }
      
      // Handle politics update/removal
      if (payload.hasOwnProperty('politics')) {
        // If politics property is present (even if undefined), explicitly set it
        newParts.politics = politics || undefined; // Empty string becomes undefined
      }
      
      this.logger.log(
        `New parts for user ${userId}: ${JSON.stringify(newParts)}`,
      );

      // Save to persistence
      await new Promise<void>((resolve, reject) => {
        this.swarmService.dispatch({
          type: 'persistence:saveState',
          payload: {
            key: `nickname:${userId}`,
            data: newParts,
            onSave: () => {
              this.logger.log(`Save command for user ${userId} complete`);
              resolve();
            },
            onError: (error: any) => {
              this.logger.error(`Failed to save nickname parts for user ${userId}`, error);
              reject(error);
            }
          },
        });
      });

      // Build the nickname suffix in the format "(pronouns)[politics]"
      let nicknameSuffix = '';
      if (newParts.pronoun || newParts.politics) {
        // Add a space before the suffixes
        nicknameSuffix = ' ';

        // Only add parentheses if there are pronouns
        if (newParts.pronoun) {
          nicknameSuffix += '(' + newParts.pronoun + ')';
        }

        // Add politics in brackets if present
        if (newParts.politics) {
          nicknameSuffix += '[' + newParts.politics + ']';
        }
      }

      this.logger.log(`Built nickname suffix: '${nicknameSuffix}'`);

      // Dispatch command to update the user's nickname
      this.logger.log(`Dispatching nickname update command for user ${userId}`);
      this.swarmService.dispatch({
        type: 'discord:setNickname',
        payload: {
          userId: userId,
          guildId: guildId,
          nickname: nicknameSuffix,
        },
      });

      this.logger.log(
        `Updated nickname for user ${userId} with suffix: ${nicknameSuffix}`,
      );
    } catch (error) {
      this.logger.error(`Failed to update nickname for user ${userId}`, error);
      throw error;
    }
  }
}