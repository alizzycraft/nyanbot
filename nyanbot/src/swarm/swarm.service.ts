import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { Command } from '@nanorepo/commands/command.interface';

@Injectable()
export class SwarmService {
  private readonly logger = new Logger(SwarmService.name);
  private readonly commandQueue = new Subject<Command>();
  readonly commandQueue$ = this.commandQueue.asObservable();

  private readonly queryHandlers = new Map<string, (payload?: any) => any>();

  dispatch(command: Command): void {
    this.commandQueue.next(command);
  }

  registerQueryHandler(
    queryType: string,
    handler: (payload?: any) => any,
  ): void {
    this.logger.log(`Registering query handler for '${queryType}'`);
    this.queryHandlers.set(queryType, handler);
  }

  executeQuery<T>(queryType: string, payload?: any): T {
    const handler = this.queryHandlers.get(queryType);
    if (!handler) {
      this.logger.error(`No query handler registered for type: ${queryType}`);
      throw new Error(`No query handler registered for type: ${queryType}`);
    }
    return handler(payload) as T;
  }
}
