import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../swarm/swarm.service';
import { PostedRoleMessage } from './interfaces/role-message.interface';

@Injectable()
export class RoleMessageStateService implements OnModuleInit {
  private readonly logger = new Logger(RoleMessageStateService.name);

  constructor(private readonly swarmService: SwarmService) {}

  onModuleInit() {
    // Initialize with persistence nanite
    this.logger.log(
      'RoleMessageStateService initialized with PersistenceNanite',
    );
  }

  addPostedMessage(message: PostedRoleMessage) {
    // Get current messages
    let currentMessages: Record<string, PostedRoleMessage> = {};
    try {
      currentMessages =
        this.swarmService.executeQuery<Record<string, PostedRoleMessage>>(
          'persistence:getState',
          'roleMessages',
        ) || {};
    } catch {
      // If no state exists, start with empty object
      this.logger.debug(
        'No existing role messages state found, starting fresh',
      );
    }

    // Add new message
    const updatedMessages = {
      ...currentMessages,
      [message.messageId]: message,
    };

    // Save updated state
    this.swarmService.dispatch({
      type: 'persistence:saveState',
      payload: {
        key: 'roleMessages',
        data: updatedMessages,
      },
    });

    this.logger.debug(
      `Added posted message: ${message.configId} (ID: ${message.messageId})`,
    );
  }

  getPostedMessageByMessageId(
    messageId: string,
  ): PostedRoleMessage | undefined {
    try {
      const messages =
        this.swarmService.executeQuery<Record<string, PostedRoleMessage>>(
          'persistence:getState',
          'roleMessages',
        ) || {};
      return messages[messageId];
    } catch (error) {
      this.logger.error(
        `Failed to get posted message by ID ${messageId}`,
        error as Error,
      );
      return undefined;
    }
  }

  clearState() {
    // Save empty state
    this.swarmService.dispatch({
      type: 'persistence:saveState',
      payload: {
        key: 'roleMessages',
        data: {},
      },
    });

    this.logger.log('Cleared role message state.');
  }
}
