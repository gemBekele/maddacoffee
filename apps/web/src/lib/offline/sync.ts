import { api } from '../api';
import { db, uuid, type OutboxItem } from './db';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
type Listener = (s: { state: SyncState; pending: number; failed: number }) => void;

class SyncEngine {
  private listeners = new Set<Listener>();
  private ticking = false;
  private timer?: number;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.flush());
      window.addEventListener('offline', () => this.emit());
      this.timer = window.setInterval(() => this.flush(), 20000);
    }
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    this.emit();
    return () => this.listeners.delete(fn);
  }

  private async emit() {
    const pending = await db.outbox.where('status').anyOf('pending', 'syncing').count();
    const failed = await db.outbox.where('status').equals('failed').count();
    const state: SyncState = !navigator.onLine
      ? 'offline'
      : this.ticking
        ? 'syncing'
        : failed > 0
          ? 'error'
          : 'idle';
    for (const l of this.listeners) l({ state, pending, failed });
  }

  /** Queue a mutation locally. Returns immediately (offline-safe). */
  async enqueue(input: Omit<OutboxItem, 'id' | 'uuid' | 'createdAt' | 'status' | 'attempts'>) {
    await db.outbox.add({
      ...input,
      uuid: uuid(),
      createdAt: Date.now(),
      status: 'pending',
      attempts: 0,
    });
    this.emit();
    this.flush();
  }

  /** Convenience: try online first, fall back to queue. */
  async save(
    method: OutboxItem['method'],
    url: string,
    payload: unknown,
    entity: string,
  ): Promise<{ queued: boolean }> {
    if (navigator.onLine) {
      try {
        await api.request({ method, url, data: payload });
        return { queued: false };
      } catch (err: any) {
        if (err?.response && err.response.status < 500) throw err;
      }
    }
    await this.enqueue({ method, url, payload, entity });
    return { queued: true };
  }

  async flush() {
    if (this.ticking || !navigator.onLine) {
      this.emit();
      return;
    }
    const items = await db.outbox.where('status').anyOf('pending', 'failed').sortBy('createdAt');
    if (!items.length) {
      this.emit();
      return;
    }
    this.ticking = true;
    this.emit();
    for (const item of items) {
      await db.outbox.update(item.id!, { status: 'syncing' });
      try {
        await api.request({ method: item.method, url: item.url, data: item.payload });
        await db.outbox.delete(item.id!);
      } catch (err: any) {
        const status = err?.response && err.response.status < 500 ? 'failed' : 'pending';
        await db.outbox.update(item.id!, {
          status,
          attempts: item.attempts + 1,
          error: err?.message ?? 'unknown',
        });
      }
    }
    this.ticking = false;
    this.emit();
  }

  async retryAll() {
    await db.outbox.where('status').equals('failed').modify({ status: 'pending' });
    this.flush();
  }

  async clearFailed() {
    await db.outbox.where('status').equals('failed').delete();
    this.emit();
  }
}

export const sync = new SyncEngine();
