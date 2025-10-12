import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';

interface NicknameParts {
  pronoun?: string;
  politics?: string;
}

@Injectable()
export class NicknameStateService implements OnModuleInit {
  private readonly logger = new Logger(NicknameStateService.name);

  constructor(private readonly swarmService: SwarmService) {}

  onModuleInit() {
    // Load initial state from persistence
    try {
      // In a complete implementation, we would dispatch a load command and wait for it
      this.logger.log(
        'NicknameStateService initialized with PersistenceNanite',
      );
    } catch (error) {
      this.logger.error('Failed to initialize nickname state', error);
    }
  }

  getNicknameParts(userId: string): NicknameParts | undefined {
    try {
      this.logger.log(`Getting nickname parts for user ${userId}`);
      this.logger.log(`Executing query with key 'nickname:${userId}'`);
      const result = this.swarmService.executeQuery<NicknameParts | undefined>(
        'persistence:getState',
        `nickname:${userId}`,
      );
      this.logger.log(`Retrieved nickname parts for user ${userId}: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Failed to get nickname parts for user ${userId}`,
        error,
      );
      return undefined;
    }
  }

  updatePronoun(userId: string, pronoun: string | undefined) {
    try {
      this.logger.log(`Updating pronoun for user ${userId} to ${pronoun}`);
      this.logger.log(`Getting current nickname parts for user ${userId}`);
      const currentParts = this.getNicknameParts(userId) || {};
      this.logger.log(`Current parts for user ${userId}: ${JSON.stringify(currentParts)}`);
      const newParts = { ...currentParts, pronoun };
      this.logger.log(`New parts for user ${userId}: ${JSON.stringify(newParts)}`);

      // Dispatch save command to persistence nanite
      this.logger.log(`Dispatching save command for user ${userId} with key 'nickname:${userId}'`);
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: `nickname:${userId}`,
          data: newParts,
        },
      });
      this.logger.log(`Dispatched save command for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to update pronoun for user ${userId}`, error);
    }
  }

  updatePolitics(userId: string, politics: string | undefined) {
    try {
      this.logger.log(`Updating politics for user ${userId} to ${politics}`);
      this.logger.log(`Getting current nickname parts for user ${userId}`);
      const currentParts = this.getNicknameParts(userId) || {};
      this.logger.log(`Current parts for user ${userId}: ${JSON.stringify(currentParts)}`);
      const newParts = { ...currentParts, politics };
      this.logger.log(`New parts for user ${userId}: ${JSON.stringify(newParts)}`);

      // Dispatch save command to persistence nanite
      this.logger.log(`Dispatching save command for user ${userId} with key 'nickname:${userId}'`);
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: `nickname:${userId}`,
          data: newParts,
        },
      });
      this.logger.log(`Dispatched save command for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to update politics for user ${userId}`, error);
    }
  }
}