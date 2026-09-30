import Dexie, { type Table } from 'dexie';

export interface OutboxItem {
  id?: number;
  uuid: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  entity: string;
  payload: unknown;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  attempts: number;
}

export interface CacheRow {
  key: string;
  value: unknown;
  updatedAt: number;
}

class MaddaDB extends Dexie {
  outbox!: Table<OutboxItem, number>;
  cache!: Table<CacheRow, string>;

  constructor() {
    super('madda');
    this.version(1).stores({
      outbox: '++id, uuid, entity, status, createdAt',
      cache: 'key, updatedAt',
    });
  }
}

export const db = new MaddaDB();

export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
