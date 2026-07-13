import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api.js';

/**
 * Panneau de gestion des photos d'une étape.
 * Supporte l'upload drag-and-drop ou file picker, la suppression, et l'affichage en galerie.
 */
export default function PhotosPanel({ stepId, roadtripId, canWrite }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(null); // index de la photo affichée en grand
  const fileInputRef = useRef(null);

  const fetchPhotos = useCallback(async () => {
    if (!stepId) return;
    try {
      const res = await api.get(`/photos?stepId=${stepId}`);
      setPhotos(res.data ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [stepId]);

  useEffect(() => { fetchPhotos(); }, [fetchPhotos]);

  async function uploadFiles(files) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const formData = new FormData();
        formData.append('photo', file);
        formData.append('stepId', stepId);
        if (roadtripId) formData.append('roadtripId', roadtripId);
        await api.post('/photos/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      await fetchPhotos();
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo) {
    if (!window.confirm(`Supprimer cette photo ?`)) return;
    try {
      await api.delete(`/photos/${photo.id}`);
      setPhotos(prev => prev.filter(p => p.id !== photo.id));
      if (lightbox !== null) setLightbox(null);
    } catch {
      // silently fail
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(e.dataTransfer.files);
  }

  function onDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function openLightbox(idx) {
    setLightbox(idx);
  }

  function moveLightbox(delta) {
    setLightbox(prev => {
      const next = prev + delta;
      if (next < 0) return photos.length - 1;
      if (next >= photos.length) return 0;
      return next;
    });
  }

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (lightbox === null) return;
    function handleKey(e) {
      if (e.key === 'ArrowLeft') moveLightbox(-1);
      if (e.key === 'ArrowRight') moveLightbox(1);
      if (e.key === 'Escape') setLightbox(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox, photos.length]);

  return (
    <div className="p-4 space-y-4">
      {/* Zone de drop */}
      {canWrite && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl px-4 py-6 text-center transition cursor-pointer ${
            dragOver
              ? 'border-indigo-400 bg-indigo-50'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <span className="animate-spin text-indigo-500">⟳</span>
              Upload en cours…
            </div>
          ) : (
            <>
              <div className="text-2xl mb-1">📸</div>
              <p className="text-sm text-gray-500">
                Glissez des photos ici ou <span className="text-indigo-600 font-medium">cliquez pour choisir</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP</p>
            </>
          )}
        </div>
      )}

      {/* Galerie */}
      {loading ? (
        <div className="text-center text-gray-400 text-sm py-4">Chargement…</div>
      ) : photos.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-4 italic">
          Aucune photo pour cette étape.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, idx) => (
            <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img
                src={photo.url}
                alt={photo.caption || `Photo ${idx + 1}`}
                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition"
                onClick={() => openLightbox(idx)}
                loading="lazy"
              />
              {canWrite && (
                <button
                  onClick={() => deletePhoto(photo)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                  title="Supprimer"
                >
                  ×
                </button>
              )}
              {photo.isCover && (
                <span className="absolute bottom-1 left-1 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-semibold">
                  Cover
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox !== null && photos[lightbox] && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition z-10"
            onClick={(e) => { e.stopPropagation(); moveLightbox(-1); }}
          >
            ‹
          </button>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white text-4xl hover:text-gray-300 transition z-10"
            onClick={(e) => { e.stopPropagation(); moveLightbox(1); }}
          >
            ›
          </button>
          <button
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 z-10"
            onClick={() => setLightbox(null)}
          >
            ×
          </button>
          <img
            src={photos[lightbox].url}
            alt={photos[lightbox].caption || ''}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {photos[lightbox].caption && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-3 py-1 rounded-full">
              {photos[lightbox].caption}
            </p>
          )}
          <p className="absolute bottom-6 right-6 text-white/50 text-xs">
            {lightbox + 1} / {photos.length}
          </p>
          {canWrite && (
            <button
              onClick={(e) => { e.stopPropagation(); deletePhoto(photos[lightbox]); }}
              className="absolute top-4 left-4 text-white/60 hover:text-red-400 text-sm transition z-10"
            >
              🗑️ Supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
