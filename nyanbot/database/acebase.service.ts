import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AceBase } from 'acebase';

@Injectable()
export class AceBaseService implements OnModuleInit, OnModuleDestroy {
  private db: AceBase;

  async onModuleInit() {
    this.db = new AceBase('nyanbot', {
      storage: { removeVoidProperties: true },
    });
    await this.db.ready();
  }

  async onModuleDestroy() {
    await this.db.close();
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.db.ref(key).set(value);
  }

  async get<T>(key: string): Promise<T | null> {
    const snapshot = await this.db.ref(key).get();
    if (snapshot.exists()) {
      return snapshot.val() as T;
    }
    return null;
  }
}
