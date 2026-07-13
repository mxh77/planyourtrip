import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import api from '../api.js';
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const ACCOMMODATION_TYPE_ICONS = {
  HOTEL: '🏨', CAMPING: '🏕️', PARKING: '🅿️', OTHER: '🏪',
};
const ACTIVITY_TYPE_ICONS = {
  ACTIVITY: '🎯', RESTAURANT: '🍽️', TRANSPORT: '🚗',
  SUPERMARKET: '🛒', HIKING: '🥾', PARKING: '🅿️', OTHER: '📍',
};
const STEP_TYPE_ICONS = {
  DEPARTURE: '🚀', STAGE: '📍', STOP: '⏸️', RETURN: '🏠',
};

function formatDate(d) {
  if (!d) return null;
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short',
  });
}

/** Retourne un timestamp local (ms) pour une date YYYY-MM-DD + heure HH:MM optionnelle */
function localTimestamp(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (timeStr) {
    const [h, min] = timeStr.split(':').map(Number);
    return new Date(y, m - 1, d, h, min, 0).getTime();
  }
  return null; // pas d'heure = vérification impossible
}

/** Formate une durée en secondes en "Xh YYmin" */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const min = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h${min > 0 ? String(min).padStart(2, '0') : ''}` : `${min}min`;
}

function nbNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return null;
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : null;
}

function formatPrice(amount, currency) {
  if (amount == null || amount === '') return null;
  const n = parseFloat(amount);
  if (isNaN(n)) return null;
  return n.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR', minimumFractionDigits: 0 });
}

/**
 * Calcule le résumé financier d'un hébergement.
 * @returns {{ nights: number|null, totalAccom: number|null, currency: string }}
 */
function accomBudget(accom) {
  const nights = nbNights(accom.checkIn, accom.checkOut);
  const price = parseFloat(accom.pricePerNight);
  const totalAccom = (nights && !isNaN(price)) ? nights * price : null;
  return { nights, totalAccom, currency: accom.currency || 'EUR' };
}

// ─── Modal photos d'une étape ───────────────────────────────────────────────────
export function StepPhotosModal({ stepId, roadtripId, stepName, canWrite, onClose, onPhotosChanged }) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await api.get(`/photos?stepId=${stepId}`);
      const p = res.data ?? [];
      setPhotos(p);
      onPhotosChanged?.(stepId, p);
    } catch {}
    finally { setLoading(false); }
  }, [stepId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  // Support copier/coller (Ctrl+V)
  useEffect(() => {
    if (!canWrite) return;
    function handlePaste(e) {
      const files = [];
      for (const item of (e.clipboardData?.items ?? [])) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length > 0) uploadFiles(files);
    }
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [canWrite, stepId]);

  async function uploadFiles(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('stepId', stepId);
        if (roadtripId) formData.append('roadtripId', roadtripId);
        await api.post('/photos/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      await fetchPhotos();
    } catch (err) { console.error('Upload error', err); }
    finally { setUploading(false); }
  }

  async function deletePhoto(photo) {
    if (!window.confirm('Supprimer cette photo ?')) return;
    try {
      await api.delete(`/photos/${photo.id}`);
      const newPhotos = photos.filter(p => p.id !== photo.id);
      setPhotos(newPhotos);
      onPhotosChanged?.(stepId, newPhotos);
    } catch {}
  }

  async function setCover(photo) {
    try {
      await Promise.all(
        photos.filter(p => p.isCover && p.id !== photo.id)
          .map(p => api.put(`/photos/${p.id}`, { isCover: false }))
      );
      const newIsCover = !photo.isCover;
      await api.put(`/photos/${photo.id}`, { isCover: newIsCover });
      const newPhotos = photos.map(p => ({ ...p, isCover: p.id === photo.id ? newIsCover : false }));
      setPhotos(newPhotos);
      onPhotosChanged?.(stepId, newPhotos);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-base">📸 Photos — {stepName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="overflow-auto flex-1 p-4 space-y-4">
          {canWrite && (
            <div
              onDrop={e => { e.preventDefault(); uploadFiles(Array.from(e.dataTransfer.files)); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl px-4 py-5 text-center cursor-pointer hover:border-indigo-300 bg-gray-50 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => uploadFiles(Array.from(e.target.files))}
              />
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                  <span className="animate-spin text-indigo-500">⟳</span>
                  Upload en cours…
                </div>
              ) : (
                <>
                  <p className="text-2xl">📸</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Glissez, <kbd className="text-xs bg-gray-100 border border-gray-200 px-1 rounded">Ctrl+V</kbd> pour coller, ou{' '}
                    <span className="text-indigo-600 font-medium">cliquez pour choisir</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-1">JPG · PNG · WEBP</p>
                </>
              )}
            </div>
          )}
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-4">Chargement…</p>
          ) : photos.length === 0 ? (
            <p className="text-center text-gray-400 text-sm italic py-4">Aucune photo pour cette étape.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map(photo => (
                <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition" />
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                    {canWrite && (
                      <>
                        <button
                          onClick={() => setCover(photo)}
                          title={photo.isCover ? 'Retirer comme couverture' : 'Définir comme photo de couverture'}
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow transition ${
                            photo.isCover
                              ? 'bg-amber-500 text-white'
                              : 'bg-white/90 text-amber-500 hover:bg-amber-500 hover:text-white'
                          }`}
                        >⭐</button>
                        <button
                          onClick={() => deletePhoto(photo)}
                          title="Supprimer"
                          className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center text-sm text-red-500 hover:bg-red-500 hover:text-white shadow transition"
                        >×</button>
                      </>
                    )}
                  </div>
                  {photo.isCover && (
                    <span className="absolute bottom-1 left-1 text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-semibold leading-none">
                      Cover
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quick-edit modal (nom + dates) ─────────────────────────────────────────────
function StepQuickEditModal({ step, onClose, onSave }) {
  const [name, setName] = useState(step.name || '');
  const [startDate, setStartDate] = useState(
    step.startDate ? step.startDate.slice(0, 10) : ''
  );
  const [arrivalTime, setArrivalTime] = useState(step.arrivalTime || '');
  const [endDate, setEndDate] = useState(
    step.endDate ? step.endDate.slice(0, 10) : ''
  );
  const [departureTime, setDepartureTime] = useState(step.departureTime || '');

  const nights = useMemo(() => {
    if (!startDate || !endDate) return null;
    const ms = new Date(endDate) - new Date(startDate);
    const n = Math.round(ms / 86400000);
    return n > 0 ? n : null;
  }, [startDate, endDate]);

  function handleSave() {
    onSave({
      ...step,
      name,
      startDate: startDate || null,
      arrivalTime: arrivalTime || null,
      endDate: endDate || null,
      departureTime: departureTime || null,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-gray-900 text-base mb-4">Modifier l'étape</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Arrivée</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Heure arrivée</label>
              <input
                type="time"
                value={arrivalTime}
                onChange={e => setArrivalTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Départ</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Heure départ</label>
              <input
                type="time"
                value={departureTime}
                onChange={e => setDepartureTime(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          {nights != null && (
            <p className="text-xs text-indigo-600 font-medium text-center">
              🌙 {nights} nuit{nights > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition">Annuler</button>
          <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition">Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable step row component ─────────────────────────────────────────────
function SortableStepTableRow({
  step, idx, budget, canWrite, isSelected,
  onSelectStep, onAddAccom, onEditAccom, onAddActivity, onEditActivity, onQuickEdit,
  isArrivalConflict, conflictTooltip,
  coverPhotoUrl, photosCount, onOpenPhotos, onBookingEmail,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const accommodations = step.accommodations ?? [];
  const activities = (step.activities ?? []).filter(a => a.type !== 'SUPERMARKET' && a.type !== 'PARKING');
  const supermarkets = (step.activities ?? []).filter(a => a.type === 'SUPERMARKET');

  // Nuits depuis les dates de l'étape
  const stepNights = useMemo(() => {
    if (!step.startDate || !step.endDate) return null;
    const ms = new Date(step.endDate) - new Date(step.startDate);
    const n = Math.round(ms / 86400000);
    return n > 0 ? n : null;
  }, [step.startDate, step.endDate]);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-gray-100 cursor-pointer transition group ${
        isSelected ? 'bg-indigo-50 ring-1 ring-inset ring-indigo-200' : 'hover:bg-amber-50/40'
      }`}
      onClick={() => onSelectStep?.(step.id)}
    >
      {/* # + drag handle */}
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-1">
          {canWrite && (
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400 transition shrink-0"
              title="Glisser pour réordonner"
              onClick={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM4.5 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM4.5 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM6 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM15.5 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM15.5 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM17 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
              </svg>
            </div>
          )}
          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
            {idx + 1}
          </span>
        </div>
      </td>

      {/* Photo couverture */}
      <td className="px-2 py-2 align-top" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onOpenPhotos?.(step)}
          className="relative flex items-center justify-center w-10 h-10 rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-indigo-400 transition shrink-0"
          title="Gérer les photos"
        >
          {coverPhotoUrl ? (
            <img src={coverPhotoUrl} alt="cover" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span className="text-base">📸</span>
          )}
          {photosCount > 0 && (
            <span className="absolute bottom-0 right-0 text-[8px] bg-indigo-600 text-white px-1 leading-4 rounded-tl font-bold">
              {photosCount}
            </span>
          )}
        </button>
      </td>

      {/* Étape */}
      <td className="px-3 py-2 align-top">
        <div className="flex items-start gap-1.5">
          {canWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuickEdit?.(step); }}
              className="text-gray-300 hover:text-indigo-500 text-xs opacity-0 group-hover:opacity-100 transition mt-0.5 shrink-0"
              title="Modifier nom et dates"
            >
              ✏️
            </button>
          )}
          <span className="text-base mt-0.5 shrink-0">{STEP_TYPE_ICONS[step.type] || '📍'}</span>
          <div>
            <p className="font-semibold text-gray-900 leading-tight">{step.name}</p>
            {step.location && (
              <p className="text-xs text-gray-400 mt-0.5 leading-tight line-clamp-2">{step.location}</p>
            )}
            {step.notes && (
              <p className="text-xs text-gray-500 mt-1 italic line-clamp-2">{step.notes}</p>
            )}
          </div>
        </div>
      </td>

      {/* Arrivée */}
      <td className="px-3 py-2 align-top">
        <div className="flex items-start gap-1">
          <div>
            {step.startDate && (
              <p className="text-gray-700 font-medium text-xs leading-tight">{formatDate(step.startDate)}</p>
            )}
            {step.arrivalTime && (
              <p className="text-xs text-indigo-500 mt-0.5">↓ {step.arrivalTime}</p>
            )}
          </div>
          {isArrivalConflict && (
            <span
              title={conflictTooltip}
              className="text-red-500 text-xs font-bold leading-none mt-0.5 shrink-0 cursor-help"
            >✕</span>
          )}
        </div>
      </td>

      {/* Départ */}
      <td className="px-3 py-2 align-top">
        {step.endDate && step.endDate !== step.startDate ? (
          <p className="text-gray-700 font-medium text-xs leading-tight">{formatDate(step.endDate)}</p>
        ) : step.startDate ? (
          <p className="text-gray-400 text-xs">—</p>
        ) : null}
        {step.departureTime && (
          <p className="text-xs text-amber-500 mt-0.5">↑ {step.departureTime}</p>
        )}
      </td>

      {/* Hébergement */}
      <td className="px-3 py-2 align-top">
        {accommodations.length === 0 ? (
          canWrite ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAddAccom?.(step.id, step); }}
              className="text-xs text-gray-300 hover:text-indigo-500 italic transition"
            >
              + ajouter
            </button>
          ) : <span className="text-xs text-gray-300 italic">—</span>
        ) : (
          <div className="space-y-1.5">
            {accommodations.map((a) => (
              <div key={a.id} className="flex items-start gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm shrink-0 mt-0.5">{ACCOMMODATION_TYPE_ICONS[a.type] || '🏨'}</span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => canWrite && onEditAccom?.(a)}
                    className={`text-xs font-medium text-gray-800 text-left leading-tight truncate max-w-[150px] block ${canWrite ? 'hover:text-indigo-600' : ''}`}
                  >
                    {a.name}
                  </button>
                  {a.bookingUrl && (
                    <a
                      href={a.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Réserver →
                    </a>
                  )}
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onBookingEmail?.(a, step); }}
                  title="Générer un email de réservation"
                  className="text-xs text-gray-300 hover:text-amber-500 shrink-0 transition mt-0.5"
                >📧</button>
              </div>
            ))}
            {canWrite && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddAccom?.(step.id, step); }}
                className="text-[10px] text-gray-300 hover:text-indigo-400 mt-0.5 transition"
              >
                + ajouter
              </button>
            )}
          </div>
        )}
      </td>

      {/* Nuits */}
      <td className="px-3 py-2 align-top text-center">
        {stepNights != null ? (
          <span className="text-xs font-semibold text-indigo-700">{stepNights}</span>
        ) : accommodations.length > 0 ? (
          <div className="space-y-1.5">
            {accommodations.map((a) => {
              const { nights } = accomBudget(a);
              return (
                <p key={a.id} className="text-xs text-gray-600">
                  {nights != null ? nights : '—'}
                </p>
              );
            })}
          </div>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>

      {/* Réf hébergt */}
      <td className="px-3 py-2 align-top">
        {accommodations.length > 0 ? (
          <div className="space-y-1.5">
            {accommodations.map((a) => (
              <p key={a.id} className="text-[11px] text-gray-500 font-mono truncate max-w-[100px]">
                {a.bookingRef || '—'}
              </p>
            ))}
          </div>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>

      {/* Prix hébergt */}
      <td className="px-3 py-2 align-top text-right">
        {budget.accomTotal != null ? (
          <span className="text-xs font-semibold text-gray-800">
            {formatPrice(budget.accomTotal, budget.currency)}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
        {accommodations.length > 0 && accommodations.some(a => a.pricePerNight) && (
          <div className="mt-0.5">
            {accommodations.map(a => {
              const { nights } = accomBudget(a);
              return a.pricePerNight != null ? (
                <p key={a.id} className="text-[10px] text-gray-400">
                  {formatPrice(a.pricePerNight, a.currency)}/nuit
                  {nights ? ` × ${nights}` : ''}
                </p>
              ) : null;
            })}
          </div>
        )}
      </td>

      {/* Activités */}
      <td className="px-3 py-2 align-top">
        {activities.length === 0 ? (
          canWrite ? (
            <button
              onClick={(e) => { e.stopPropagation(); onAddActivity?.(step.id, step); }}
              className="text-xs text-gray-300 hover:text-indigo-500 italic transition"
            >
              + ajouter
            </button>
          ) : <span className="text-xs text-gray-300 italic">—</span>
        ) : (
          <div className="space-y-1">
            {activities.map((act) => (
              <div key={act.id} className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs shrink-0">{ACTIVITY_TYPE_ICONS[act.type] || '📍'}</span>
                <button
                  onClick={() => canWrite && onEditActivity?.(act)}
                  className={`text-[11px] text-gray-700 text-left truncate max-w-[150px] leading-tight ${canWrite ? 'hover:text-indigo-600' : ''}`}
                >
                  {act.name}
                </button>
                {act.cost != null && parseFloat(act.cost) > 0 && (
                  <span className="text-[10px] text-gray-400 shrink-0">
                    ({formatPrice(act.cost, act.currency)})
                  </span>
                )}
              </div>
            ))}
            {canWrite && (
              <button
                onClick={(e) => { e.stopPropagation(); onAddActivity?.(step.id, step); }}
                className="text-[10px] text-gray-300 hover:text-indigo-400 transition"
              >
                + ajouter
              </button>
            )}
          </div>
        )}
      </td>

      {/* Ravitaillement */}
      <td className="px-3 py-2 align-top">
        {supermarkets.length === 0 ? (
          <span className="text-xs text-gray-300 italic">—</span>
        ) : (
          <div className="space-y-1">
            {supermarkets.map((act) => (
              <div key={act.id} className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs">🛒</span>
                <button
                  onClick={() => canWrite && onEditActivity?.(act)}
                  className={`text-[11px] text-gray-700 text-left truncate max-w-[110px] leading-tight ${canWrite ? 'hover:text-indigo-600' : ''}`}
                >
                  {act.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Prix activités */}
      <td className="px-3 py-2 align-top text-right">
        {budget.activityTotal != null ? (
          <span className="text-xs font-semibold text-gray-800">
            {formatPrice(budget.activityTotal, budget.currency)}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>

      {/* Total étape */}
      <td className="px-3 py-2 align-top text-right">
        {budget.total != null ? (
          <span className="text-sm font-bold text-indigo-700">
            {formatPrice(budget.total, budget.currency)}
          </span>
        ) : <span className="text-xs text-gray-300">—</span>}
      </td>


    </tr>
  );
}

export default function PlanningTableView({
  steps,
  routes,          // Record<"fromId→toId", { durationText, distanceText }>
  selectedStepId,  // id de l'étape sélectionnée (highlight)
  onSelectStep,
  onRouteClick,    // (fromStep, toStep) => void — ouvre le panel d'alternatives
  onComputeRoute,  // (fromStep, toStep) => void — calcule le trajet à la demande
  onRouteSelect,   // (fromStep, toStep) => void — zoom carte sur le segment
  canWrite,
  roadtripId,
  onAddAccom,
  onEditAccom,
  onAddActivity,
  onEditActivity,
  onEditStep,          // (step) => void — ouvre le StepModal complet
  onQuickUpdateStep,   // ({ id, name, startDate, endDate }) => void — sauvegarde rapide
  onReorder,
  externalPhotosCache,      // optionnel : cache photos géré par le parent
  onExternalPhotosChanged,  // optionnel : callback parent quand photos changent
  onBookingEmail,           // (accom, step) => void — ouvre le modal email de réservation
}) {
  const [editingStep, setEditingStep] = useState(null);
  const [photosModal, setPhotosModal] = useState(null); // { stepId, stepName }
  const [internalCache, setInternalCache] = useState({}); // stepId -> Photo[]

  // Utiliser le cache externe si fourni, sinon le cache interne
  const stepPhotosCache = externalPhotosCache ?? internalCache;

  function handlePhotosChanged(stepId, photos) {
    if (onExternalPhotosChanged) {
      onExternalPhotosChanged(stepId, photos);
    } else {
      setInternalCache(prev => ({ ...prev, [stepId]: photos }));
    }
  }

  // Charger les photos uniquement si aucun cache externe n'est fourni
  useEffect(() => {
    if (externalPhotosCache) return; // le parent gère le chargement
    if (!steps || steps.length === 0) return;
    steps.forEach(async (step) => {
      try {
        const res = await api.get(`/photos?stepId=${step.id}`);
        const p = Array.isArray(res.data) ? res.data : [];
        setInternalCache(prev => ({ ...prev, [step.id]: p }));
      } catch { /* silencieux */ }
    });
  }, [steps.map(s => s.id).join(','), !!externalPhotosCache]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  function handleDragEnd(event) {
    const { active, over } = event;
    if (over && active.id !== over.id) onReorder?.(active.id, over.id);
  }

  // Tri croissant par startDate puis arrivalTime
  const sortedSteps = useMemo(() => {
    return [...steps].sort((a, b) => {
      const dateA = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const dateB = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      if (dateA !== dateB) return dateA - dateB;
      // même date : trier par heure d'arrivée
      const timeA = a.arrivalTime ?? '';
      const timeB = b.arrivalTime ?? '';
      return timeA.localeCompare(timeB);
    });
  }, [steps]);

  // Calculer les totaux par étape et le grand total
  const stepBudgets = useMemo(() => {
    return sortedSteps.map((step) => {
      let accomTotal = 0;
      let activityTotal = 0;
      let currency = 'EUR';

      (step.accommodations ?? []).forEach((a) => {
        const { nights, totalAccom, currency: c } = accomBudget(a);
        if (totalAccom) { accomTotal += totalAccom; currency = c; }
      });
      (step.activities ?? []).forEach((act) => {
        const c = parseFloat(act.cost);
        if (!isNaN(c) && c > 0) activityTotal += c;
      });

      const total = accomTotal + activityTotal;
      return {
        stepId: step.id,
        accomTotal: accomTotal > 0 ? accomTotal : null,
        activityTotal: activityTotal > 0 ? activityTotal : null,
        total: total > 0 ? total : null,
        currency,
      };
    });
  }, [steps]);

  const grandTotal = useMemo(() => {
    let accom = 0; let activity = 0; let currency = 'EUR';
    stepBudgets.forEach((b) => {
      if (b.accomTotal) accom += b.accomTotal;
      if (b.activityTotal) activity += b.activityTotal;
      currency = b.currency;
    });
    return { accom, activity, total: accom + activity, currency };
  }, [stepBudgets]);

  function handleQuickEditSave(updatedStep) {
    if (onQuickUpdateStep) {
      onQuickUpdateStep(updatedStep);
    } else {
      onEditStep?.(updatedStep);
    }
  }

  if (steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
        <p className="text-gray-400 text-sm">Aucune étape pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-white">
      {editingStep && (
        <StepQuickEditModal
          step={editingStep}
          onClose={() => setEditingStep(null)}
          onSave={handleQuickEditSave}
        />
      )}
      {photosModal && (
        <StepPhotosModal
          stepId={photosModal.stepId}
          roadtripId={roadtripId}
          stepName={photosModal.stepName}
          canWrite={canWrite}
          onClose={() => setPhotosModal(null)}
          onPhotosChanged={handlePhotosChanged}
        />
      )}
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
            <th className="w-8 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400">#</th>
            <th className="w-12 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400">Photo</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[160px]">Étape</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[110px]">Arrivée</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[110px]">Départ</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[180px]">Hébergement</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-14">Nuits</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-28">Réf. hébergt</th>
            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-24">Prix hébergt</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[180px]">Activités</th>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 min-w-[140px]">
              <span title="Activités type SUPERMARKET">🛒 Ravitaillement</span>
            </th>
            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-400 w-24">Prix activités</th>
            <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-indigo-400 w-24">Total étape</th>
          </tr>
        </thead>
        <tbody>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedSteps.map(s => s.id)} strategy={verticalListSortingStrategy}>
              {sortedSteps.map((step, idx) => {
                const budget = stepBudgets[idx];
                const prevStep = idx > 0 ? sortedSteps[idx - 1] : null;
                const prevGeoStep = idx > 0 ? sortedSteps.slice(0, idx).reverse().find(s => s.latitude != null && s.longitude != null) : null;
                const routeKey = prevGeoStep ? `${prevGeoStep.id}→${step.id}` : null;
                const route = routeKey ? routes?.[routeKey] : null;

                // Contrôle de cohérence temporelle
                let isArrivalConflict = false;
                let conflictTooltip = '';
                if (prevStep && route?.durationSeconds) {
                  const prevDeparture = localTimestamp(prevStep.endDate ?? prevStep.startDate, prevStep.departureTime);
                  const arrival = localTimestamp(step.startDate, step.arrivalTime);
                  if (prevDeparture !== null && arrival !== null) {
                    const earliestArrival = prevDeparture + route.durationSeconds * 1000;
                    if (arrival <= earliestArrival) {
                      isArrivalConflict = true;
                      const earliest = new Date(earliestArrival);
                      const hh = String(earliest.getHours()).padStart(2, '0');
                      const mm = String(earliest.getMinutes()).padStart(2, '0');
                      conflictTooltip = `Arrivée trop tôt ! Trajet = ${formatDuration(route.durationSeconds)} depuis "${prevStep.name}" (départ ${prevStep.departureTime}). Arrivée au plus tôt : ${hh}:${mm}`;
                    }
                  }
                }

                return (
                  <React.Fragment key={step.id}>
                    {/* Ligne "trajet" séparatrice entre étapes */}
                    {idx > 0 && (
                      <tr className="bg-gradient-to-r from-indigo-50 to-transparent">
                        <td colSpan={canWrite ? 14 : 13} className="px-3 py-1">
                          <div className="flex items-center gap-2 text-xs">
                            <button
                              onClick={() => {
                                if (!prevGeoStep || step.latitude == null) return;
                                if (route) {
                                  onRouteSelect?.(prevGeoStep, step);
                                  onRouteClick?.(prevGeoStep, step);
                                } else {
                                  onComputeRoute?.(prevGeoStep, step);
                                }
                              }}
                              className={`flex items-center gap-2 ${
                                prevGeoStep && step.latitude != null
                                  ? 'text-indigo-500 hover:text-indigo-700 cursor-pointer'
                                  : 'text-gray-300 cursor-default'
                              }`}
                              title={!prevGeoStep || step.latitude == null ? 'Coordonnées manquantes' : route ? "Voir les alternatives d'itinéraire" : 'Calculer le trajet'}
                              disabled={!prevGeoStep || step.latitude == null}
                            >
                              <span>🚗</span>
                              {route ? (
                                <>
                                  <span className="font-semibold">{route.durationText}</span>
                                  <span className="text-gray-400">·</span>
                                  <span>{route.distanceText}</span>
                                  <span className="ml-1 text-gray-300 hover:text-indigo-400">↗</span>
                                </>
                              ) : (
                                <span className={prevGeoStep && step.latitude != null ? 'text-gray-400 italic hover:text-indigo-500' : 'text-gray-300 italic'}>
                                  {prevGeoStep && step.latitude != null ? 'Calculer' : '—'}
                                </span>
                              )}
                            </button>
                            {route && prevGeoStep && step.latitude != null && (
                              <>
                                <span className="text-gray-200">|</span>
                                <a
                                  href={`https://www.google.com/maps/dir/${prevGeoStep.latitude},${prevGeoStep.longitude}/${step.latitude},${step.longitude}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-blue-400 hover:text-blue-600 transition font-medium"
                                  title="Ouvrir dans Google Maps"
                                >🗺 Maps</a>
                                <a
                                  href={`https://www.waze.com/fr/live-map/directions?from=ll.${prevGeoStep.latitude},${prevGeoStep.longitude}&to=ll.${step.latitude},${step.longitude}&navigate=yes`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-cyan-400 hover:text-cyan-600 transition font-medium"
                                  title="Ouvrir dans Waze"
                                >Waze</a>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Ligne principale (sortable) */}
                    <SortableStepTableRow
                      step={step}
                      idx={idx}
                      budget={budget}
                      canWrite={canWrite}
                      isSelected={step.id === selectedStepId}
                      onSelectStep={onSelectStep}
                      onAddAccom={onAddAccom}
                      onEditAccom={onEditAccom}
                      onAddActivity={onAddActivity}
                      onEditActivity={onEditActivity}
                      onQuickEdit={setEditingStep}
                      isArrivalConflict={isArrivalConflict}
                      conflictTooltip={conflictTooltip}
                      coverPhotoUrl={stepPhotosCache[step.id]?.find(p => p.isCover)?.url ?? null}
                      photosCount={stepPhotosCache[step.id]?.length ?? 0}
                      onOpenPhotos={(s) => setPhotosModal({ stepId: s.id, stepName: s.name })}
                      onBookingEmail={onBookingEmail}
                    />
                  </React.Fragment>
                );
              })}
            </SortableContext>
          </DndContext>

          {/* Ligne totaux */}
          {steps.length > 0 && (
            <tr className="bg-indigo-50 border-t-2 border-indigo-200 sticky bottom-0">
              <td colSpan={8} className="px-3 py-3">
                <span className="text-sm font-bold text-gray-700">TOTAL ROADTRIP</span>
              </td>
              <td className="px-3 py-3 text-right">
                {grandTotal.accom > 0 && (
                  <span className="text-sm font-semibold text-gray-800">
                    {formatPrice(grandTotal.accom, grandTotal.currency)}
                  </span>
                )}
              </td>
              <td className="px-3 py-3"></td>
              <td className="px-3 py-3"></td>
              <td className="px-3 py-3 text-right">
                {grandTotal.activity > 0 && (
                  <span className="text-sm font-semibold text-gray-800">
                    {formatPrice(grandTotal.activity, grandTotal.currency)}
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right">
                {grandTotal.total > 0 && (
                  <span className="text-base font-bold text-indigo-700">
                    {formatPrice(grandTotal.total, grandTotal.currency)}
                  </span>
                )}
              </td>
              {canWrite && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
