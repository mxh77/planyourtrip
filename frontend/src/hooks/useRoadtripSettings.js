import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

/**
 * Charge les paramètres d'un roadtrip depuis l'API.
 * Retourne les settings avec les valeurs par défaut si non définis.
 */
export function useRoadtripSettings(roadtripId) {
  const token = useAuthStore((s) => s.token);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!roadtripId || !token) return;
    fetch(`${API_URL}/api/roadtrips/${roadtripId}/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSettings(data);
        }
      })
      .catch(() => {}); // silencieux — on utilise les défauts du composant
  }, [roadtripId, token]);

  return settings;
}
