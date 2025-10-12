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
  private readonly keyMapping = new Map<string, string>(); // sanitizedKey -> originalKey

  constructor(private readonly swarmService: SwarmService) {}

  async onModuleInit() {
    await this.ensureStateDirectory();
    
    // Load existing state files
    await this.loadExistingState();

    // Register Query Handlers
    this.swarmService.registerQueryHandler(
      'persistence:getState',
      (key: string) => {
        this.logger.log(`Query handler called for key '${key}'`);
        const sanitizedKey = this.sanitizeKey(key);
        this.logger.log(`Sanitized key: '${sanitizedKey}'`);
        const result = this.state.get(sanitizedKey);
        this.logger.log(`Result for key '${key}': ${JSON.stringify(result)}`);
        return result;
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

  private async loadExistingState(): Promise<void> {
    try {
      const files = await fs.readdir(STATE_PATH);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const sanitizedKey = file.slice(0, -5); // Remove .json extension
          // We can't easily convert back to original key, so we'll just load the data
          // and use the sanitized key as both the map key and for lookups
          const data = await this.loadStateFromDiskBySanitizedKey(sanitizedKey);
          if (data !== null) {
            this.state.set(sanitizedKey, data);
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load existing state files', error as Error);
    }
  }

  private async loadStateFromDiskBySanitizedKey(sanitizedKey: string): Promise<unknown> {
    try {
      const filePath = path.join(STATE_PATH, `${sanitizedKey}.json`);
      const data = await fs.readFile(filePath, 'utf-8');
      this.logger.log(`State for sanitized key '${sanitizedKey}' loaded from disk.`);
      return JSON.parse(data);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') {
        this.logger.warn(`No state file found for sanitized key '${sanitizedKey}'.`);
        return null;
      }
      this.logger.error(
        `Failed to load state for sanitized key '${sanitizedKey}'`,
        error as Error,
      );
      return null;
    }
  }

  private async handleSaveState<T>(
    payload: PersistenceSaveStateCommandPayload<T>,
  ): Promise<void> {
    this.logger.log(`Handling save state command for key '${payload.key}'`);
    const sanitizedKey = this.sanitizeKey(payload.key);
    this.logger.log(`Sanitized key: '${sanitizedKey}'`);
    this.keyMapping.set(sanitizedKey, payload.key); // Store mapping
    this.state.set(sanitizedKey, payload.data);
    this.logger.log(`Set state in memory for key '${sanitizedKey}'`);
    await this.saveStateToDisk(payload.key, payload.data);
    this.logger.log(`Finished handling save state command for key '${payload.key}'`);
  }

  private async handleLoadState(payload: { key: string }): Promise<void> {
    const sanitizedKey = this.sanitizeKey(payload.key);
    this.keyMapping.set(sanitizedKey, payload.key); // Store mapping
    const data = await this.loadStateFromDisk(payload.key);
    if (data !== null) {
      this.state.set(sanitizedKey, data);
    }
  }

  private async ensureStateDirectory() {
    try {
      await fs.mkdir(STATE_PATH, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create state directory', error as Error);
    }
  }

  private sanitizeKey(key: string): string {
    // Sanitize the key to remove characters that are invalid in filenames on Windows
    return key.replace(/[:\/\\?*"<>|]/g, '_');
  }

  private getFilePath(key: string): string {
    const sanitizedKey = this.sanitizeKey(key);
    return path.join(STATE_PATH, `${sanitizedKey}.json`);
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