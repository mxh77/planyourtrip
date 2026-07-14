import { usePowerSync } from '@powersync/react-native';
import { useEffect, useState } from 'react';

/**
 * Hook pour debugger PowerSync — log le statut et force une reconnexion si besoin
 */
export function usePowerSyncDebug() {
  const db = usePowerSync();
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!db) return;

    const unsubscribe = db.registerListener({
      statusChanged: (s) => {
        console.log('[PowerSync Debug]', {
          connected: s.connected,
          lastSync: s.lastSyncedAt,
          downloading: s.downloading,
          uploading: s.uploading,
          hasCrudPending: s.hasCrudPending,
        });
        setStatus(s);
      },
    });

    return unsubscribe;
  }, [db]);

  const forceSync = async () => {
    try {
      console.log('[PowerSync Debug] forceSync called...');
      if (db) {
        // Forcer une reconnexion
        await db.disconnect();
        await new Promise(r => setTimeout(r, 500));
        // Note: connect sera appelé automatiquement par PowerSyncProvider
        console.log('[PowerSync Debug] Reconnected');
      }
    } catch (error) {
      console.error('[PowerSync Debug] forceSync error:', error);
    }
  };

  return { status, forceSync, db };
}
