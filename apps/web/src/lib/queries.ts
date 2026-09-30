import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { sync } from './offline/sync';

export function useList<T = any>(key: string[], url: string, enabled = true) {
  return useQuery<T>({
    queryKey: key,
    queryFn: async () => (await api.get(url)).data,
    enabled,
  });
}

/**
 * Offline-aware mutation: tries the API, queues locally if offline.
 * The exact endpoint + method are passed so the sync engine can replay it.
 */
export function useOfflineSave(
  invalidateKey: string[][],
  opts: { method?: 'POST' | 'PATCH' | 'PUT'; url: string | ((vars: any) => string) },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const url = typeof opts.url === 'function' ? opts.url(payload) : opts.url;
      return sync.save(opts.method ?? 'POST', url, payload, 'record');
    },
    onSuccess: () => {
      for (const k of invalidateKey) qc.invalidateQueries({ queryKey: k });
    },
  });
}
