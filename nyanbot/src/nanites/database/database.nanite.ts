import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { AceBase } from 'acebase';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import {
  isDatabaseGetCommand,
  isDatabaseSetCommand,
} from './database.interface';
import { join } from 'path';
// @ts-ignore
import mkdirp from 'mkdirp';

@Injectable()
export class DatabaseNanite implements OnModuleInit, OnModuleDestroy {
  private db: AceBase;
  private isReady = false;
  private readonly logger = new Logger(DatabaseNanite.name);
  private operationCount = 0;
  private readonly dbPath = '.database';

  constructor(private readonly swarmService: SwarmService) {}

  async onModuleInit() {
    try {
      // Ensure the database directory exists before initializing AceBase
      const fullPath = join(process.cwd(), this.dbPath);
      await mkdirp(fullPath);
      this.logger.log(`Ensured database directory exists at: ${fullPath}`);

      // Configure AceBase with a consistent name and proper storage settings
      // This will allow data to persist across application restarts
      this.db = new AceBase('nyanbot', {
        storage: { 
          removeVoidProperties: true,
          // Store data in the .database directory relative to the project root
          path: this.dbPath
        },
        logLevel: 'error' // Reduce logging
      });
      
      // Wait for database to be ready
      await this.db.ready();
      this.isReady = true;
      this.logger.log('Database initialized successfully with persistent storage at .database path');

      // Register Query Handlers
      this.swarmService.registerQueryHandler(
        'database:get',
        async (key: string) => {
          return this.get(key);
        },
      );

      // Subscribe to Swarm Commands
      this.swarmService.commandQueue$
        .pipe(filter(isDatabaseSetCommand))
        .subscribe(async ({ payload }) => {
          try {
            await this.set(payload.key, payload.value);
            if (payload.onSet) {
              payload.onSet();
            }
          } catch (error) {
            this.logger.error(`Error handling database:set command for key '${payload.key}'`, error as Error);
          }
        });

      this.swarmService.commandQueue$
        .pipe(filter(isDatabaseGetCommand))
        .subscribe(async ({ payload }) => {
          try {
            await this.get(payload.key);
          } catch (error) {
            this.logger.error(`Error handling database:get command for key '${payload.key}'`, error as Error);
          }
        });
    } catch (error) {
      this.logger.error('Failed to initialize database', error as Error);
      // If database initialization fails, we might have a corrupted database
      // Let's try to recover by removing the database directory and starting fresh
      this.logger.warn('Attempting to recover from database corruption by starting fresh');
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.db && this.isReady) {
      try {
        this.isReady = false;
        this.logger.log(`Closing database with ${this.operationCount} pending operations`);
        await this.db.close();
        this.logger.log('Database closed successfully');
      } catch (error) {
        this.logger.error('Error closing database', error as Error);
      }
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.isReady) {
      throw new Error('Database is not ready');
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const operationId = ++this.operationCount;
    this.logger.debug(`Starting set operation #${operationId} for key '${key}'`);
    
    try {
      await this.ensureReady();
      await this.db.ref(key).set(value);
      this.logger.debug(`Completed set operation #${operationId} for key '${key}'`);
    } catch (error) {
      this.logger.error(`Failed to set key '${key}' in database (operation #${operationId})`, error as Error);
      // If we get a corruption error, we might need to restart the database
      if (error instanceof Error && error.message.includes('CORRUPT RECORD')) {
        this.logger.error('Database corruption detected during set operation');
        // We can't recover from corruption within a single operation, 
        // but we can log it and let the application handle restart
      }
      throw error;
    } finally {
      this.operationCount--;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const operationId = ++this.operationCount;
    this.logger.debug(`Starting get operation #${operationId} for key '${key}'`);
    
    try {
      await this.ensureReady();
      const snapshot = await this.db.ref(key).get();
      this.logger.debug(`Completed get operation #${operationId} for key '${key}'`);
      
      if (snapshot.exists()) {
        return snapshot.val() as T;
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to get key '${key}' from database (operation #${operationId})`, error as Error);
      // If we get a corruption error, we might need to restart the database
      if (error instanceof Error && error.message.includes('CORRUPT RECORD')) {
        this.logger.error('Database corruption detected during get operation');
        // We can't recover from corruption within a single operation,
        // but we can log it and let the application handle restart
      }
      throw error;
    } finally {
      this.operationCount--;
    }
  }
}