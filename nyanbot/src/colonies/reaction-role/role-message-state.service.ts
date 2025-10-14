import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { PostedRoleMessage } from '@nanorepo/model/role-message.model';

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

  async addPostedMessage(message: PostedRoleMessage): Promise<void> {
    // Get current messages
    let currentMessages: Record<string, PostedRoleMessage> = {};
    try {
      currentMessages = (await this.getPostedMessages()) || {};
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
    return new Promise((resolve) => {
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: 'roleMessages',
          data: updatedMessages,
          onSave: () => {
            this.logger.debug(
              `Added posted message: ${message.configId} (ID: ${message.messageId})`,
            );
            resolve();
          },
        },
      });
    });
  }

  async getPostedMessageByMessageId(
    messageId: string,
  ): Promise<PostedRoleMessage | undefined> {
    try {
      const messages = await this.getPostedMessages();
      return messages[messageId];
    } catch (error) {
      this.logger.error(
        `Failed to get posted message by ID ${messageId}`,
        error as Error,
      );
      return undefined;
    }
  }

  async getPostedMessages(): Promise<Record<string, PostedRoleMessage>> {
    try {
      return (
        (await this.swarmService.executeQuery<
          Promise<Record<string, PostedRoleMessage>>
        >('persistence:getState', 'roleMessages')) || {}
      );
    } catch (error) {
      this.logger.error('Failed to get posted messages', error as Error);
      return {};
    }
  }

  async removePostedMessage(messageId: string): Promise<void> {
    const currentMessages = await this.getPostedMessages();
    delete currentMessages[messageId];

    return new Promise((resolve) => {
      this.swarmService.dispatch({
        type: 'persistence:saveState',
        payload: {
          key: 'roleMessages',
          data: currentMessages,
          onSave: () => {
            this.logger.debug(`Removed posted message: ${messageId}`);
            resolve();
          },
        },
      });
    });
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
