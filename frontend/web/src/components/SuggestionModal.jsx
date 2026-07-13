import React, { useState, useRef, useEffect } from 'react';
import api from '../api.js';

const CATEGORIES = [
  { key: 'bug',       label: '🐛 Bug',        desc: "Quelque chose ne fonctionne pas" },
  { key: 'evolution', label: '💡 Évolution',  desc: "Une idée d'amélioration" },
  { key: 'question',  label: '❓ Question',   desc: "Besoin d'aide" },
  { key: 'other',     label: '… Autre',       desc: "Autre chose" },
];

const MAX_CONTENT = 2000;
const MAX_FILES   = 5;

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 Mo

const EXTENSION_MAP = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

export default function SuggestionModal({ onClose }) {
  const [category, setCategory] = useState('evolution');
  const [content, setContent]   = useState('');
  const [files, setFiles]       = useState([]); // [{ file: File, preview?: string }]
  const [sending, setSending]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  function handleFileChange(e) {
    const selected = Array.from(e.target.files || []);
    const remaining = MAX_FILES - files.length;
    const toAdd = selected.slice(0, remaining).map(f => ({
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    }));
    setFiles(prev => [...prev, ...toAdd]);
    e.target.value = '';
  }

  function removeFile(idx) {
    setFiles(prev => {
      const copy = [...prev];
      if (copy[idx]?.preview) URL.revokeObjectURL(copy[idx].preview);
      copy.splice(idx, 1);
      return copy;
    });
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    const cf = e.clipboardData?.files;
    const extractedFiles = [];

    // Fallback Safari : clipboardData.items peut exister mais être vide pour les images
    // → basculer sur clipboardData.files
    if ((!items || items.length === 0) && cf && cf.length > 0) {
      let imageFound = false;
      for (let i = 0; i < cf.length; i++) {
        const file = cf[i];
        if (!file.type.startsWith('image/')) continue;
        imageFound = true;
        extractedFiles.push(file);
      }
      if (imageFound) e.preventDefault();
    } else if (items && items.length > 0) {
      // Parcours standard via clipboardData.items
      let imageFound = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.type.startsWith('image/')) continue;
        imageFound = true;
        const file = item.getAsFile();
        if (!file) continue;
        extractedFiles.push(file);
      }
      if (imageFound) e.preventDefault();
    }

    if (extractedFiles.length === 0) return;

    // Validation et ajout des fichiers images trouvés
    const validated = [];
    for (const file of extractedFiles) {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setToast({ type: 'error', message: `Format d'image non accepté. Formats autorisés : PNG, JPEG, GIF, WebP, SVG.` });
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setToast({ type: 'error', message: `Image trop volumineuse (max 5 Mo).` });
        continue;
      }
      const ext = EXTENSION_MAP[file.type] || 'png';
      const renamed = new File([file], `collé.${ext}`, { type: file.type });
      validated.push({
        file: renamed,
        preview: URL.createObjectURL(renamed),
      });
    }

    if (validated.length > 0) {
      setFiles(prev => {
        const remaining = MAX_FILES - prev.length;
        const toAdd = validated.slice(0, remaining);
        if (validated.length > remaining) {
          setToast({ type: 'warning', message: `Nombre maximum de fichiers atteint (${MAX_FILES}). Certaines images n'ont pas été ajoutées.` });
        }
        return [...prev, ...toAdd];
      });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!content.trim()) { setError('Le contenu est requis.'); return; }
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('content', content.trim());
      form.append('category', category);
      files.forEach(f => form.append('files', f.file));
      await api.post('/suggestions', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de l\'envoi.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Envoyer une suggestion</h2>
            <p className="text-xs text-gray-400 mt-0.5">Votre retour nous aide à améliorer l'app</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none p-1">✕</button>
        </div>

        {success ? (
          <div className="px-5 py-10 text-center space-y-3">
            <div className="text-4xl">🙏</div>
            <p className="font-semibold text-gray-900">Merci pour votre suggestion !</p>
            <p className="text-sm text-gray-500">Nous l'examinerons dès que possible.</p>
            <button
              onClick={onClose}
              className="mt-4 bg-amber-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-amber-600 transition"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {/* Catégorie */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Catégorie</p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
                    className={`text-left px-3 py-2 rounded-xl border text-sm transition ${
                      category === cat.key
                        ? 'border-amber-400 bg-amber-50 text-amber-800 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="block font-medium">{cat.label}</span>
                    <span className="block text-xs opacity-70 mt-0.5">{cat.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Contenu */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Votre message</p>
                <span className={`text-xs ${content.length > MAX_CONTENT * 0.9 ? 'text-amber-600' : 'text-gray-400'}`}>
                  {content.length} / {MAX_CONTENT}
                </span>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value.slice(0, MAX_CONTENT))}
                onPaste={handlePaste}
                rows={4}
                placeholder="Décrivez votre suggestion, problème ou question…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Fichiers */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Fichiers joints <span className="font-normal normal-case text-gray-400">({files.length}/{MAX_FILES})</span>
                </p>
                {files.length < MAX_FILES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-amber-600 hover:text-amber-800 font-medium"
                  >
                    + Ajouter
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown"
                onChange={handleFileChange}
                className="hidden"
              />
              {files.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {files.map((f, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <div className="relative group">
                        {f.preview ? (
                          <img
                            src={f.preview}
                            alt={f.file.name}
                            className="w-14 h-14 object-cover rounded-lg border border-gray-200"
                          />
                        ) : (
                          <div className="w-14 h-14 flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-xl">
                            📄
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          ✕
                        </button>
                      </div>
                      <span className="block text-[10px] text-gray-400 text-center truncate max-w-[56px] leading-tight">
                        {f.file.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                Vous pouvez également coller une image depuis votre presse-papier (Ctrl+V)
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {toast && (
              <div className={`text-sm px-3 py-2 rounded-lg border ${
                toast.type === 'error'
                  ? 'text-red-600 bg-red-50 border-red-200'
                  : toast.type === 'warning'
                    ? 'text-amber-600 bg-amber-50 border-amber-200'
                    : 'text-blue-600 bg-blue-50 border-blue-200'
              }`}>
                {toast.message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1 pb-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={sending || !content.trim()}
                className="flex-1 bg-amber-500 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
