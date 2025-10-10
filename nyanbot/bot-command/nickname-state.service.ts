import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

interface NicknameParts {
  pronoun?: string;
  politics?: string;
}

@Injectable()
export class NicknameStateService implements OnModuleInit {
  private readonly logger = new Logger(NicknameStateService.name);
  private nicknameState = new Map<string, NicknameParts>();
  private readonly stateFilePath = path.join(process.cwd(), 'nickname.state.json');
  private saveQueue = Promise.resolve();

  async onModuleInit() {
    await this.loadState();
  }

  private async loadState() {
    try {
      const data = await fs.readFile(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.nicknameState = new Map<string, NicknameParts>(parsed.nicknameState);
      this.logger.log(`Loaded nickname state for ${this.nicknameState.size} users.`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.logger.log('Nickname state file not found. Starting with a clean state.');
      } else {
        this.logger.error('Failed to load nickname state from file.', error);
      }
    }
  }

  private saveState() {
    this.saveQueue = this.saveQueue.then(async () => {
      const dataToSave = {
        nicknameState: Array.from(this.nicknameState.entries()),
      };
      try {
        await fs.writeFile(this.stateFilePath, JSON.stringify(dataToSave, null, 2), 'utf-8');
        this.logger.debug('Saved nickname state to file.');
      } catch (error) {
        this.logger.error('Failed to save nickname state to file.', error);
      }
    }).catch(error => {
        this.logger.error('Error in nickname state save queue execution.', error);
    });
  }

  getNicknameParts(userId: string): NicknameParts | undefined {
    return this.nicknameState.get(userId);
  }

  updatePronoun(userId: string, pronoun: string | undefined) {
    const parts = this.nicknameState.get(userId) || {};
    parts.pronoun = pronoun;
    this.nicknameState.set(userId, parts);
    this.saveState();
  }

  updatePolitics(userId: string, politics: string | undefined) {
    const parts = this.nicknameState.get(userId) || {};
    parts.politics = politics;
    this.nicknameState.set(userId, parts);
    this.saveState();
  }
}