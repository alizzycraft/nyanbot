import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import {
  isPersistenceLoadStateCommand,
  isPersistenceSaveStateCommand,
  PersistenceSaveStateCommandPayload,
} from './persistence.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

const STATE_PATH = path.join(process.cwd(), 'state');

@Injectable()
export class PersistenceNanite implements OnModuleInit {
  private readonly logger = new Logger(PersistenceNanite.name);
  private readonly state = new Map<string, unknown>();

  constructor(private readonly swarmService: SwarmService) {}

  async onModuleInit() {
    await this.ensureStateDirectory();

    // Register Query Handlers
    this.swarmService.registerQueryHandler(
      'persistence:getState',
      (key: string) => {
        return this.state.get(key);
      },
    );

    // Subscribe to Swarm Commands
    this.swarmService.commandQueue$
      .pipe(filter(isPersistenceSaveStateCommand))
      .subscribe(({ payload }) => {
        void this.handleSaveState(payload);
      });

    this.swarmService.commandQueue$
      .pipe(filter(isPersistenceLoadStateCommand))
      .subscribe(({ payload }) => {
        void this.handleLoadState(payload);
      });

    this.logger.log('PersistenceNanite initialized');
  }

  private async handleSaveState<T>(
    payload: PersistenceSaveStateCommandPayload<T>,
  ): Promise<void> {
    this.state.set(payload.key, payload.data);
    await this.saveStateToDisk(payload.key, payload.data);
  }

  private async handleLoadState(payload: { key: string }): Promise<void> {
    const data = await this.loadStateFromDisk(payload.key);
    if (data !== null) {
      this.state.set(payload.key, data);
    }
  }

  private async ensureStateDirectory() {
    try {
      await fs.mkdir(STATE_PATH, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create state directory', error as Error);
    }
  }

  private getFilePath(key: string): string {
    return path.join(STATE_PATH, `${key}.json`);
  }

  private async saveStateToDisk(key: string, data: unknown): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      this.logger.log(`State for key '${key}' saved to disk.`);
    } catch (error) {
      this.logger.error(
        `Failed to save state for key '${key}'`,
        error as Error,
      );
    }
  }

  private async loadStateFromDisk(key: string): Promise<unknown> {
    try {
      const filePath = this.getFilePath(key);
      const data = await fs.readFile(filePath, 'utf-8');
      this.logger.log(`State for key '${key}' loaded from disk.`);
      return JSON.parse(data);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        this.logger.warn(`No state file found for key '${key}'.`);
        return null;
      }
      this.logger.error(
        `Failed to load state for key '${key}'`,
        error as Error,
      );
      return null;
    }
  }
}
