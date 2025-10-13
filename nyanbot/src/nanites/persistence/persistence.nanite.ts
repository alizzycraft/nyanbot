import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import {
  isPersistenceLoadStateCommand,
  isPersistenceSaveStateCommand,
  PersistenceSaveStateCommandPayload,
} from './persistence.interface';
// Removed AceBaseService import

@Injectable()
export class PersistenceNanite implements OnModuleInit {
  private readonly logger = new Logger(PersistenceNanite.name);

  constructor(
    private readonly swarmService: SwarmService,
  ) {}

  onModuleInit() {
    // Register Query Handlers
    this.swarmService.registerQueryHandler(
      'persistence:getState',
      async (key: string) => {
        this.logger.log(`Query handler called for key '${key}'`);
        const result = await this.swarmService.executeQuery('database:get', key);
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

  private async handleSaveState<T>(
    payload: PersistenceSaveStateCommandPayload<T>,
  ): Promise<void> {
    this.logger.log(`Handling save state command for key '${payload.key}'`);
    this.swarmService.dispatch({
      type: 'database:set',
      payload: {
        key: payload.key,
        value: payload.data,
      },
    });
    this.logger.log(
      `Finished handling save state command for key '${payload.key}'`,
    );
    if (payload.onSave) {
      payload.onSave();
    }
  }

  private async handleLoadState(payload: { key: string }): Promise<void> {
    await this.swarmService.executeQuery('database:get', payload.key);
    // The state is now managed by the database nanite, so we don't need to set it in memory here.
    // We might want to emit an event here to notify other parts of the application that the state has been loaded.
  }
}
