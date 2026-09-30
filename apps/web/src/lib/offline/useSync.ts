import { useEffect, useState } from 'react';
import { sync, type SyncState } from './sync';

export function useSyncStatus() {
  const [status, setStatus] = useState<{ state: SyncState; pending: number; failed: number }>({
    state: 'idle',
    pending: 0,
    failed: 0,
  });
  useEffect(() => {
    const unsubscribe = sync.subscribe(setStatus);
    return () => {
      unsubscribe();
    };
  }, []);
  return { ...status, flush: () => sync.flush(), retryAll: () => sync.retryAll() };
}
