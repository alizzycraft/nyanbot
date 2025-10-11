import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../swarm/swarm.service';

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
      return this.swarmService.executeQuery<NicknameParts | undefined>(
        'persistence:getState',
        `nickname:${userId}`,
      );
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
      const currentParts = this.getNicknameParts(userId) || {};
      const newParts = { ...currentParts, pronoun };

      // Dispatch save command to persistence nanite
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: `nickname:${userId}`,
          data: newParts,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update pronoun for user ${userId}`, error);
    }
  }

  updatePolitics(userId: string, politics: string | undefined) {
    try {
      const currentParts = this.getNicknameParts(userId) || {};
      const newParts = { ...currentParts, politics };

      // Dispatch save command to persistence nanite
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: `nickname:${userId}`,
          data: newParts,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to update politics for user ${userId}`, error);
    }
  }
}
