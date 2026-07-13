import React, { useState, useRef } from 'react';
import api from '../api.js';

const PR_NUMBER = import.meta.env.VITE_PREVIEW_PR_NUMBER;

const CATEGORIES = [
  { value: 'missing_feature', label: 'Fonctionnalité manquante' },
  { value: 'incorrect_behavior', label: 'Comportement incorrect' },
  { value: 'ui_issue', label: 'Problème UI' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Autre' },
];

const MODELS = [
  { value: 'deepseek-v4-flash', label: 'DeepSeek v4 Flash' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
];

const MAX_SCREENSHOTS = 5;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ data: reader.result, mimeType: file.type || 'image/png' });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PreviewQAReporter() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('incorrect_behavior');
  const [aiModel, setAiModel] = useState('deepseek-v4-flash');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [screenshots, setScreenshots] = useState([]); // [{ data: base64, mimeType, preview }]
  const fileInputRef = useRef(null);

  // N'afficher que sur les previews (variable injectée au build)
  if (!PR_NUMBER) return null;

  async function addImages(files) {
    const remaining = MAX_SCREENSHOTS - screenshots.length;
    if (remaining <= 0) return;
    const toAdd = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, remaining);
    const encoded = await Promise.all(toAdd.map(fileToBase64));
    // Ajouter preview URL pour affichage
    const withPreview = encoded.map(s => ({ ...s, preview: s.data }));
    setScreenshots(prev => [...prev, ...withPreview]);
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await addImages(imageFiles);
    }
  }

  function removeScreenshot(index) {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
  }

  async function send() {
    if (!description.trim()) return;
    setSending(true);
    try {
      await api.post(`/admin/devhub/prs/${PR_NUMBER}/report-bug`, {
        bug_description: description,
        bug_category: category,
        ai_model: aiModel,
        screenshots: screenshots.map(s => ({ data: s.data, mimeType: s.mimeType })),
      });
      setSent(true);
      setDescription('');
      setCategory('incorrect_behavior');
      setScreenshots([]);
      setTimeout(() => { setSent(false); setOpen(false); }, 2000);
    } catch {
      alert('Erreur lors de l\'envoi du rapport.');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        title="Reporter un bug QA"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-sky-600 transition-colors"
        style={{ boxShadow: '0 4px 20px rgba(14,165,233,0.45)' }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
          <path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>
        </svg>
        QA · PR #{PR_NUMBER}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-5 sm:items-center sm:justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/>
                  <path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>
                </svg>
                <span className="font-semibold text-gray-800">Reporter un bug — PR #{PR_NUMBER}</span>
              </div>
              <button onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Body */}
            {sent ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                <p className="font-semibold text-gray-700">Rapport envoyé !</p>
                <p className="text-xs text-gray-400">Le bug est enregistré et visible dans le DevHub pour traitement.</p>
              </div>
            ) : (
              <div className="space-y-3 p-5" onPaste={handlePaste}>
                <p className="text-xs text-gray-500">
                  Décris le problème constaté sur le preview. Le QA agent va analyser et proposer un correctif automatiquement.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Catégorie</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-sky-400 focus:outline-none">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Modèle IA</label>
                  <select value={aiModel} onChange={e => setAiModel(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:border-sky-400 focus:outline-none">
                    {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
                  <textarea
                    autoFocus
                    rows={4}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Exemple : Le bouton de validation ne réagit pas au clic. La page se recharge au lieu de sauvegarder."
                    className="w-full resize-none rounded-lg border border-gray-200 p-3 text-sm text-gray-700 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                {/* Zone screenshots */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-600">Screenshots <span className="text-gray-400 font-normal">({screenshots.length}/{MAX_SCREENSHOTS})</span></label>
                    {screenshots.length < MAX_SCREENSHOTS && (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Ajouter
                      </button>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { if (e.target.files) addImages(e.target.files); e.target.value = ''; }} />
                  {screenshots.length === 0 ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-400 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-500 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      Cliquer ou coller (Ctrl+V) pour ajouter un screenshot
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {screenshots.map((s, i) => (
                        <div key={i} className="group relative h-16 w-24 overflow-hidden rounded-md border border-gray-200">
                          <img src={s.preview} alt={`screenshot-${i + 1}`} className="h-full w-full object-cover" />
                          <button type="button" onClick={() => removeScreenshot(i)}
                            className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      ))}
                      {screenshots.length < MAX_SCREENSHOTS && (
                        <button type="button" onClick={() => fileInputRef.current?.click()}
                          className="flex h-16 w-24 items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400 hover:border-sky-300 hover:text-sky-400 transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5v14"/></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            {!sent && (
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-200 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  onClick={send}
                  disabled={!description.trim() || sending}
                  className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/>
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v8z" className="opacity-75"/>
                      </svg>
                      Envoi…
                    </>
                  ) : 'Envoyer au QA Agent'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
