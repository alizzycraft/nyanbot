import { Module } from '@nestjs/common';
import { AceBaseService } from './acebase.service';

@Module({
  providers: [AceBaseService],
  exports: [AceBaseService],
})
export class DatabaseModule {}
