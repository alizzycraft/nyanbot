import { Module } from '@nestjs/common';
import { RoleMessageStateService } from './role-message-state.service';
import { roleMessageConfigs } from './role-message.config';

@Module({
  providers: [
    RoleMessageStateService,
    {
      provide: 'ROLE_MESSAGE_CONFIGS',
      useValue: roleMessageConfigs,
    },
  ],
  exports: [RoleMessageStateService, 'ROLE_MESSAGE_CONFIGS'],
})
export class RoleMessageModule {}
