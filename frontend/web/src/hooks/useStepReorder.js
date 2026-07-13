import { useState, useCallback } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import api from '../api.js';

/**
 * Gère le réordonnement des étapes avec mise à jour optimiste + appel API.
 * @param {Array} steps
 * @param {Function} setSteps
 * @param {string} roadtripId
 * @param {Function} onReordered — appelé après reorder réussi avec les nouvelles étapes
 */
export function useStepReorder(steps, setSteps, roadtripId, onReordered) {
  const [saving, setSaving] = useState(false);

  const reorder = useCallback(async (activeId, overId) => {
    if (activeId === overId) return;

    const oldIndex = steps.findIndex(s => s.id === activeId);
    const newIndex = steps.findIndex(s => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(steps, oldIndex, newIndex);

    // Mise à jour optimiste
    setSteps(reordered);

    // Invalider les routes qui impliquaient les étapes déplacées
    if (onReordered) onReordered(reordered);

    // Persister
    setSaving(true);
    try {
      await api.patch('/steps/reorder', {
        roadtripId,
        order: reordered.map((s, i) => ({ id: s.id, order: i })),
      });
    } catch {
      // Rollback en cas d'erreur
      setSteps(steps);
    } finally {
      setSaving(false);
    }
  }, [steps, setSteps, roadtripId, onReordered]);

  return { reorder, saving };
}
