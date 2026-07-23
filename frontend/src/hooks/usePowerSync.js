import { useQuery } from '@powersync/react-native';
import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

/**
 * Retourne tous les roadtrips de l'utilisateur connecté (owned + shared).
 * Réactif pour les roadtrips owned (PowerSync), fetch REST pour les partagés.
 */
export function useRoadtrips() {
  const userId = useAuthStore((s) => s.user?.id);
  const token = useAuthStore((s) => s.token);
  const [sharedRoadtrips, setSharedRoadtrips] = useState([]);

  // Roadtrips dont l'utilisateur est OWNER (depuis PowerSync local)
  const { data: ownedData, isLoading } = useQuery(
    userId
      ? `SELECT r.*, COUNT(s.id) as stepCount, 'OWNER' as userRole
         FROM roadtrips r
         LEFT JOIN steps s ON s.roadtripId = r.id
         WHERE r.userId = ?
         GROUP BY r.id
         ORDER BY r.createdAt DESC`
      : 'SELECT * FROM roadtrips WHERE 1=0',
    userId ? [userId] : []
  );

  // Roadtrips partagés — fetch REST (non PowerSync car hors scope de sync)
  const fetchShared = useCallback(() => {
    if (!token) return;
    fetch(`${API_URL}/api/roadtrips`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(all => {
        const shared = all.filter(r => r.userRole !== 'OWNER');
        setSharedRoadtrips(shared.map(r => ({ ...r, stepCount: r.steps?.length ?? 0 })));
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => { fetchShared(); }, [fetchShared]);

  const owned = ownedData ?? [];
  const ownedIds = new Set(owned.map(r => r.id));
  const uniqueShared = sharedRoadtrips.filter(r => !ownedIds.has(r.id));
  const roadtrips = [...owned, ...uniqueShared].sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );

  return { roadtrips, isLoading, refreshShared: fetchShared };
}

/**
 * Retourne un roadtrip avec ses steps, activités et hébergements.
 */
export function useRoadtrip(id) {
  const token = useAuthStore((s) => s.token);
  const [apiRoadtrip, setApiRoadtrip] = useState(null);

  const { data: roadtripRows, isLoading: rtLoading } = useQuery(
    id ? 'SELECT * FROM roadtrips WHERE id = ?' : 'SELECT * FROM roadtrips WHERE 1=0',
    id ? [id] : []
  );

  const { data: steps } = useQuery(
    id ? 'SELECT * FROM steps WHERE roadtripId = ? ORDER BY "order" ASC' : 'SELECT * FROM steps WHERE 1=0',
    id ? [id] : []
  );

  const { data: accommodations } = useQuery(
    id
      ? 'SELECT * FROM accommodations WHERE stepId IN (SELECT id FROM steps WHERE roadtripId = ?)'
      : 'SELECT * FROM accommodations WHERE 1=0',
    id ? [id] : []
  );

  const { data: activities } = useQuery(
    id
      ? 'SELECT * FROM activities WHERE stepId IN (SELECT id FROM steps WHERE roadtripId = ?) ORDER BY "order" ASC'
      : 'SELECT * FROM activities WHERE 1=0',
    id ? [id] : []
  );

  const roadtrip = roadtripRows?.[0] ?? null;

  // Assembler les steps avec leurs relations
  const stepsWithRelations = (steps ?? []).map((step) => ({
    ...step,
    accommodations: (accommodations ?? []).filter((a) => a.stepId === step.id),
    activities: (activities ?? []).filter((a) => a.stepId === step.id),
  }));

  // Fallback REST pour les roadtrips partagés (non syncés dans PowerSync)
  useEffect(() => {
    if (rtLoading || roadtrip || !id || !token) return;
    fetch(`${API_URL}/api/roadtrips/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => setApiRoadtrip(data))
      .catch(() => {});
  }, [id, token, roadtrip, rtLoading]);

  const result = roadtrip ? { ...roadtrip, steps: stepsWithRelations } : apiRoadtrip;

  return { roadtrip: result };
}

/**
 * Retourne les activités d'un step.
 */
export function useActivities(stepId) {
  const { data } = useQuery(
    stepId
      ? 'SELECT * FROM activities WHERE stepId = ? ORDER BY "order" ASC'
      : 'SELECT * FROM activities WHERE 1=0',
    stepId ? [stepId] : []
  );
  return { activities: data ?? [] };
}

/**
 * Retourne un step avec son hébergement et ses activités.
 */
export function useStep(stepId) {
  const { data: stepRows } = useQuery(
    stepId ? 'SELECT * FROM steps WHERE id = ?' : 'SELECT * FROM steps WHERE 1=0',
    stepId ? [stepId] : []
  );
  const { data: accommodationRows } = useQuery(
    stepId ? 'SELECT * FROM accommodations WHERE stepId = ?' : 'SELECT * FROM accommodations WHERE 1=0',
    stepId ? [stepId] : []
  );
  const { data: activities } = useQuery(
    stepId
      ? 'SELECT * FROM activities WHERE stepId = ? ORDER BY "order" ASC'
      : 'SELECT * FROM activities WHERE 1=0',
    stepId ? [stepId] : []
  );

  const step = stepRows?.[0] ?? null;
  return {
    step: step
      ? { ...step, accommodations: accommodationRows ?? [], activities: activities ?? [] }
      : null,
  };
}

/**
 * Retourne les photos d'un step — lecture réactive PowerSync (offline-first).
 */
export function useStepPhotos(stepId) {
  const { data } = useQuery(
    stepId
      ? 'SELECT * FROM photos WHERE stepId = ? ORDER BY createdAt ASC'
      : 'SELECT * FROM photos WHERE 1=0',
    stepId ? [stepId] : []
  );
  return { photos: data ?? [] };
}

/**
 * Retourne les dépenses custom d'un roadtrip — lecture réactive PowerSync.
 */
export function useExpenses(roadtripId) {
  const { data, isLoading } = useQuery(
    roadtripId
      ? 'SELECT * FROM expenses WHERE roadtripId = ? ORDER BY date ASC, createdAt ASC'
      : 'SELECT * FROM expenses WHERE 1=0',
    roadtripId ? [roadtripId] : []
  );
  return { expenses: data ?? [], isLoading };
}

/**
 * Retourne les dépenses liées à une étape spécifique.
 */
export function useStepExpenses(stepId) {
  const { data, isLoading } = useQuery(
    stepId
      ? 'SELECT * FROM expenses WHERE stepId = ? ORDER BY date ASC, createdAt ASC'
      : 'SELECT * FROM expenses WHERE 1=0',
    stepId ? [stepId] : []
  );
  return { stepExpenses: data ?? [], isLoading };
}
