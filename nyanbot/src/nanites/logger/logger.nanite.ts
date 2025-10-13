import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SwarmService } from '../../swarm/swarm.service';
import { filter } from 'rxjs/operators';
import { Command } from '../../swarm/interfaces/command.interface';

export interface LogCommandPayload {
  message: string;
  context?: string;
}

export const isLogCommand = (
  command: Command,
): command is Command<LogCommandPayload> => command.type === 'log';

@Injectable()
export class LoggerNanite implements OnModuleInit {
  private readonly logger = new Logger(LoggerNanite.name);

  constructor(private readonly swarmService: SwarmService) {}

  onModuleInit() {
    this.swarmService.commandQueue$
      .pipe(filter(isLogCommand))
      .subscribe(({ payload }) => {
        this.logger.log(payload.message, payload.context);
      });

    this.logger.log('LoggerNanite initialized');
  }
}
