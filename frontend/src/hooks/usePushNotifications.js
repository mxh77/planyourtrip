import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

const PROJECT_ID =
  Constants.expoConfig?.extra?.eas?.projectId ??
  '6d159ae1-b2e7-4004-a7cc-eb2c3b05ce82';

// Affichage des notifications reçues quand l'app est en foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const token = useAuthStore((s) => s.token);
  const notifListenerRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;

    async function registerPushToken() {
      try {
        // Vérifier / demander les permissions
        const { status: existing } = await Notifications.getPermissionsAsync();
        console.log('[PushNotifications] permission existante:', existing);
        let finalStatus = existing;
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
          console.log('[PushNotifications] permission après demande:', finalStatus);
        }
        if (finalStatus !== 'granted') {
          console.warn('[PushNotifications] permission refusée, abandon');
          return;
        }

        // Canal Android (obligatoire pour Android 8+)
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Notifications',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#34A853',
          });
        }

        // Récupérer le token Expo
        console.log('[PushNotifications] récupération du token Expo...');
        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
          projectId: PROJECT_ID,
        });
        console.log('[PushNotifications] token obtenu:', expoPushToken);
        if (!expoPushToken || cancelled) return;

        // Envoyer au backend
        const resp = await fetch(`${API_URL}/api/auth/push-token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token: expoPushToken }),
        });
        console.log('[PushNotifications] backend réponse:', resp.status);
      } catch (err) {
        console.warn('[PushNotifications] erreur:', err?.message);
      }
    }

    registerPushToken();

    // Écouter les notifications reçues en foreground (optionnel, juste pour log)
    notifListenerRef.current = Notifications.addNotificationReceivedListener((notif) => {
      console.log('[PushNotifications] reçue :', notif.request.content.title);
    });

    return () => {
      cancelled = true;
      notifListenerRef.current?.remove();
    };
  }, [token]);
}
