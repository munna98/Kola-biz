/**
 * useSyncRefresh
 *
 * Listens for the `sync:data-changed` Tauri event that the background sync
 * task emits whenever it successfully pulled new rows from Turso into the
 * local SQLite database.  Callers can supply `onRefresh` callbacks that will
 * be invoked so their component re-fetches its data without a full page reload.
 *
 * Usage:
 *   useSyncRefresh({
 *     onProductsChange: () => reloadProducts(),
 *     onVouchersChange: () => reloadVouchers(),
 *   });
 */
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';

interface SyncRefreshOptions {
  /** Called whenever the background sync pulled data (may include product changes). */
  onProductsChange?: () => void;
  /** Called whenever the background sync pulled data (may include voucher changes). */
  onVouchersChange?: () => void;
  /** Called for any pulled data — a catch-all refresh. */
  onAnyChange?: () => void;
}

export function useSyncRefresh({
  onProductsChange,
  onVouchersChange,
  onAnyChange,
}: SyncRefreshOptions) {
  useEffect(() => {
    // Listen returns a promise that resolves to an unlisten function.
    const unlisten = listen<{ company_id: string; pulled: number; pushed: number }>(
      'sync:data-changed',
      (_event) => {
        onAnyChange?.();
        onProductsChange?.();
        onVouchersChange?.();
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onProductsChange, onVouchersChange, onAnyChange]);
}
