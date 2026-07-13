import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api.js';

const TYPE_CONFIG = {
  BUG:        { label: 'Bug',        color: 'bg-red-100 text-red-700' },
  SUGGESTION: { label: 'Suggestion', color: 'bg-blue-100 text-blue-700' },
  QUESTION:   { label: 'Question',   color: 'bg-purple-100 text-purple-700' },
  AUTRE:      { label: 'Autre',      color: 'bg-gray-100 text-gray-600' },
};

const TYPES_ALL = ['ALL', 'BUG', 'SUGGESTION', 'QUESTION', 'AUTRE'];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminFeedbackPage() {
  const navigate = useNavigate();
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const [filterType, setFilterType] = useState('ALL');
  const [filterHandled, setFilterHandled] = useState('ALL'); // ALL | PENDING | DONE

  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/beta/feedbacks');
      setFeedbacks(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des feedbacks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeedbacks(); }, [fetchFeedbacks]);

  async function patchFeedback(id, patch) {
    try {
      const { data } = await api.patch(`/beta/feedbacks/${id}`, patch);
      setFeedbacks(prev => prev.map(fb => fb.id === id ? data : fb));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/login');
  }

  const visible = feedbacks.filter(fb => {
    if (filterType !== 'ALL' && fb.type !== filterType) return false;
    if (filterHandled === 'PENDING' && fb.isHandled) return false;
    if (filterHandled === 'DONE' && !fb.isHandled) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-800 transition">← Accueil</Link>
          <span className="text-gray-300">|</span>
          <span className="text-2xl font-serif font-bold text-gray-900">PlanYourRide</span>
          <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">Admin</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/admin/users" className="text-sm text-gray-500 border border-gray-200 bg-white rounded-lg px-4 py-2 hover:bg-gray-50 transition">Utilisateurs</Link>
          <Link to="/admin/suggestions" className="text-sm text-gray-500 border border-gray-200 bg-white rounded-lg px-4 py-2 hover:bg-gray-50 transition">Suggestions</Link>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-800 transition">Déconnexion</button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Titre + actualiser */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Feedbacks beta</h1>
            <p className="text-sm text-gray-500 mt-1">
              {visible.length} / {feedbacks.length} retour{feedbacks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchFeedbacks}
            className="text-sm bg-white border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition"
          >
            ↻ Actualiser
          </button>
        </div>

        {/* Filtres */}
        <div className="flex flex-wrap gap-2 mb-6">
          {/* Filtre type */}
          <div className="flex gap-1">
            {TYPES_ALL.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                  filterType === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
              >
                {t === 'ALL' ? 'Tous' : TYPE_CONFIG[t]?.label}
              </button>
            ))}
          </div>
          <div className="w-px bg-gray-200" />
          {/* Filtre traité */}
          {[['ALL','Tous'], ['PENDING','À traiter'], ['DONE','Traités']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setFilterHandled(val)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
                filterHandled === val
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>

        {loading && <div className="text-center py-20 text-gray-400">Chargement...</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6">{error}</div>}
        {!loading && !error && visible.length === 0 && (
          <div className="text-center py-20 text-gray-400">Aucun feedback pour ce filtre.</div>
        )}

        {!loading && visible.length > 0 && (
          <div className="space-y-4">
            {visible.map((fb) => {
              const tc = TYPE_CONFIG[fb.type] ?? TYPE_CONFIG.AUTRE;
              return (
                <div
                  key={fb.id}
                  className={`bg-white rounded-xl border p-5 shadow-sm transition ${
                    fb.isHandled ? 'border-green-200 opacity-70' : 'border-gray-200'
                  }`}
                >
                  {/* Ligne supérieure : badge type + toggle traité */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    {/* Badge type cliquable (cycle) */}
                    <div className="flex items-center gap-2">
                      <select
                        value={fb.type}
                        onChange={(e) => patchFeedback(fb.id, { type: e.target.value })}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border-0 cursor-pointer outline-none ${tc.color}`}
                      >
                        {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Toggle traité */}
                    <button
                      onClick={() => patchFeedback(fb.id, { isHandled: !fb.isHandled })}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                        fb.isHandled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {fb.isHandled ? '✓ Traité' : '○ À traiter'}
                    </button>
                  </div>

                  {/* Texte */}
                  <p className="text-gray-900 whitespace-pre-wrap text-sm leading-relaxed">{fb.text}</p>

                  {/* Photos */}
                  {Array.isArray(fb.photoUrls) && fb.photoUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {fb.photoUrls.map((url, idx) => (
                        <button key={idx} onClick={() => setLightbox(url)} className="focus:outline-none">
                          <img
                            src={url}
                            alt={`Photo ${idx + 1}`}
                            className="w-24 h-24 object-cover rounded-lg border border-gray-200 hover:opacity-80 transition cursor-pointer"
                          />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <span className="font-medium text-gray-600">{fb.user?.name || fb.user?.email || 'Inconnu'}</span>
                    <span>·</span>
                    <span>{fb.user?.email}</span>
                    <span>·</span>
                    <span>{formatDate(fb.createdAt)}</span>
                    {fb.isHandled && fb.handledAt && (
                      <>
                        <span>·</span>
                        <span className="text-green-600">traité le {formatDate(fb.handledAt)}</span>
                      </>
                    )}
                    {Array.isArray(fb.photoUrls) && fb.photoUrls.length > 0 && (
                      <><span>·</span><span>📷 {fb.photoUrls.length}</span></>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white text-3xl leading-none hover:opacity-70 transition">✕</button>
          <img src={lightbox} alt="Aperçu" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
