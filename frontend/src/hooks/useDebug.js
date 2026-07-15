/**
 * Hook pour détecter les re-renders en boucle
 * Aide à diagnostiquer les problèmes de performance
 */

import { useEffect, useRef } from 'react';
import { log, warn } from '../services/logger';

/**
 * useRenderDebug - Trace et alerte si un composant re-rend trop souvent
 * @param {string} componentName - Nom du composant
 * @param {number} maxRenders - Nombre max de re-renders autorisés en 5 secondes
 * @param {object} deps - Array de dépendances (comme useEffect)
 */
export function useRenderDebug(componentName, maxRenders = 10, deps = []) {
  const renderCountRef = useRef(0);
  const timeWindowRef = useRef(Date.now());

  useEffect(() => {
    renderCountRef.current++;
    const now = Date.now();
    const timeElapsed = now - timeWindowRef.current;

    // Reset la fenêtre de temps tous les 5 secondes
    if (timeElapsed > 5000) {
      log('RENDER', `${componentName}: ${renderCountRef.current} re-renders en 5s`);
      renderCountRef.current = 0;
      timeWindowRef.current = now;
    } else if (renderCountRef.current > maxRenders) {
      warn('RENDER', `⚠️ ${componentName} re-rend excessivement (${renderCountRef.current}x en 5s)!`);
    }
  });

  return renderCountRef;
}

/**
 * useEffectDebug - Trace quand un useEffect s'exécute
 * @param {string} name - Nom du useEffect
 * @param {function} effect - Fonction à exécuter
 * @param {array} deps - Array de dépendances
 */
export function useEffectDebug(name, effect, deps) {
  const isInitialRef = useRef(true);

  useEffect(() => {
    if (isInitialRef.current) {
      log('EFFECT', `${name}: MOUNT`);
      isInitialRef.current = false;
    } else {
      const depsStr = Array.isArray(deps)
        ? deps.map((d) => (typeof d === 'object' ? JSON.stringify(d) : String(d))).join(',')
        : 'no deps';
      log('EFFECT', `${name}: UPDATE (deps: ${depsStr})`);
    }

    return () => {
      log('EFFECT', `${name}: CLEANUP`);
    };
  }, deps);
}

export default { useRenderDebug, useEffectDebug };
