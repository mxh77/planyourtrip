import React, { useState, useEffect } from 'react';
import { computeRouteAlternatives } from '../utils/directions.js';

/**
 * Panneau d'alternatives d'itinéraires entre deux étapes.
 * S'affiche quand l'utilisateur clique sur un segment de trajet.
 */
export default function RouteAlternativesPanel({ fromStep, toStep, currentRoute, onSelectRoute, onClose }) {
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!fromStep?.latitude || !toStep?.latitude) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSelectedIdx(0);
    computeRouteAlternatives(
      { lat: parseFloat(fromStep.latitude), lng: parseFloat(fromStep.longitude) },
      { lat: parseFloat(toStep.latitude), lng: parseFloat(toStep.longitude) }
    ).then((alts) => {
      setAlternatives(alts);
      setLoading(false);
    });
  }, [fromStep?.id, toStep?.id]);

  function handleSelect(idx) {
    setSelectedIdx(idx);
    onSelectRoute?.(alternatives[idx]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-sm mx-0 sm:mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Alternatives d'itinéraires</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {fromStep?.name} → {toStep?.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none ml-3"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-6">Calcul des itinéraires…</div>
          ) : alternatives.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-6">
              Impossible de calculer les itinéraires.<br />
              Vérifiez que Routes API est activée dans Google Cloud Console.
            </div>
          ) : (
            <div className="space-y-2">
              {alternatives.map((alt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  className={`w-full text-left px-3 py-3 rounded-xl border-2 transition ${
                    selectedIdx === idx
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {idx === 0 && (
                        <span className="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          Recommandé
                        </span>
                      )}
                      <span className="font-semibold text-gray-900">{alt.durationText}</span>
                    </div>
                    <span className="text-sm text-gray-500">{alt.distanceText}</span>
                  </div>
                  {alt.description && (
                    <p className="text-xs text-gray-400 mt-1 truncate">via {alt.description}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && alternatives.length > 0 && (
          <div className="px-4 pb-4">
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition"
            >
              Appliquer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
