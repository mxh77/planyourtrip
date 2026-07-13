import React, { useEffect, useRef } from 'react';
import { PowerSyncContext } from '@powersync/react-native';
import { db } from '../powersync/db';
import { AppConnector } from '../powersync/connector';
import { useAuthStore } from '../store/authStore';

const TAG = __DEV__ ? '[MPR_Debug][PowerSync]' : '[MPR][PowerSync]';

export function AppPowerSyncProvider({ children }) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.user?.id);
  const connectorRef = useRef(null);
  const prevUserIdRef = useRef(null);

  useEffect(() => {
    if (!token || !userId) {
      // Déconnexion : vider la base locale pour ne pas laisser
      // traîner la queue CRUD d'un autre utilisateur
      db.disconnectAndClear().catch(() => db.disconnect());
      prevUserIdRef.current = null;
      return;
    }

    const userChanged = prevUserIdRef.current && prevUserIdRef.current !== userId;
    if (userChanged) {
      // Changement de compte : vider impérativement les données locales
      // de l'ancien utilisateur (queue CRUD, cache SQLite)
      console.log(TAG, 'userId changé → disconnectAndClear()');
      db.disconnectAndClear().then(() => {
        prevUserIdRef.current = userId;
        const getToken = () => Promise.resolve(useAuthStore.getState().token);
        connectorRef.current = new AppConnector(getToken);
        db.connect(connectorRef.current);
      }).catch(() => {});
      return;
    }

    prevUserIdRef.current = userId;

    const getToken = () => Promise.resolve(useAuthStore.getState().token);
    connectorRef.current = new AppConnector(getToken);

    db.connect(connectorRef.current);

    const unsubscribe = db.registerListener({
      statusChanged: (status) => {
        console.log(TAG, 'status →',
          `connected=${status.connected}`,
          `lastSync=${status.lastSyncedAt ?? 'jamais'}`,
          `downloading=${status.downloading}`,
          `uploading=${status.uploading}`,
        );
      },
    });

    return () => {
      unsubscribe?.();
      db.disconnect();
    };
  }, [token]);

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}
