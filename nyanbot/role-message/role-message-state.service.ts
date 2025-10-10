import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BehaviorSubject, Observable } from 'rxjs';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface PostedRoleMessage {
  configId: string; // Which config generated this message
  guildId: string;
  channelId: string;
  messageId: string; // The ID of the message on Discord
  postedAt: Date;
}

interface RoleMessageState {
  postedMessages: Map<string, PostedRoleMessage>; // Key: messageId
}

@Injectable()
export class RoleMessageStateService implements OnModuleInit {
  private readonly logger = new Logger(RoleMessageStateService.name);
  private readonly _state = new BehaviorSubject<RoleMessageState>({ postedMessages: new Map() });
  public readonly state$: Observable<RoleMessageState> = this._state.asObservable();
  private readonly stateFilePath = path.join(process.cwd(), 'role-messages.state.json');
  private saveQueue = Promise.resolve();

  async onModuleInit() {
    await this.loadState();
  }

  private async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      // JSON dates are strings, so we need to convert them back to Date objects
      const postedMessages = new Map<string, PostedRoleMessage>(
        parsed.postedMessages.map(([key, value]: [string, PostedRoleMessage]) => [key, { ...value, postedAt: new Date(value.postedAt) }]),
      );
      this._state.next({ postedMessages });
      this.logger.log(`Loaded ${postedMessages.size} posted role messages from state file.`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.log('State file not found. Starting with a clean state.');
      } else {
        this.logger.error('Failed to load state from file.', error);
      }
    }
  }

  private saveState() {
    this.saveQueue = this.saveQueue.then(async () => {
      const state = this._state.getValue();
      const dataToSave = {
        postedMessages: Array.from(state.postedMessages.entries()),
      };
      try {
        await fs.writeFile(this.stateFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
        this.logger.debug('Saved role message state to file.');
      } catch (error) {
        this.logger.error('Failed to save state to file.', error);
      }
    }).catch(error => {
        this.logger.error('Error in save queue execution.', error);
    });
  }

  addPostedMessage(message: PostedRoleMessage) {
    const currentState = this._state.getValue();
    const newPostedMessages = new Map(currentState.postedMessages);
    newPostedMessages.set(message.messageId, message);
    this._state.next({ ...currentState, postedMessages: newPostedMessages });
    this.logger.debug(`Added posted message: ${message.configId} (ID: ${message.messageId})`);
    this.saveState();
  }

  getPostedMessageByMessageId(messageId: string): PostedRoleMessage | undefined {
    return this._state.getValue().postedMessages.get(messageId);
  }

  clearState() {
    this._state.next({ postedMessages: new Map() });
    this.saveState(); // queue up a save
    this.logger.log('Cleared role message state.');
  }
}
