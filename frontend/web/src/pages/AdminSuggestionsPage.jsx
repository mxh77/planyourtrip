import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../api.js';

const CATEGORY_CONFIG = {
  bug:       { label: 'Bug',       color: 'bg-red-100 text-red-700',    border: 'border-red-200' },
  evolution: { label: 'Évolution', color: 'bg-blue-100 text-blue-700',  border: 'border-blue-200' },
  question:  { label: 'Question',  color: 'bg-purple-100 text-purple-700', border: 'border-purple-200' },
  other:     { label: 'Autre',     color: 'bg-gray-100 text-gray-600',  border: 'border-gray-200' },
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function SuggestionCard({ suggestion, onToggleStatus, onDelete, onConvertToIssue }) {
  const cat = CATEGORY_CONFIG[suggestion.category] || CATEGORY_CONFIG.other;
  const files = Array.isArray(suggestion.files) ? suggestion.files : [];
  const [converting, setConverting] = useState(false);

  async function handleConvert() {
    if (suggestion.githubIssueNumber) {
      if (!window.confirm(`Une issue #${suggestion.githubIssueNumber} existe déjà. Créer une nouvelle issue ?`)) return;
    }
    setConverting(true);
    try {
      await onConvertToIssue(suggestion.id, !!suggestion.githubIssueNumber);
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${cat.color} ${cat.border}`}>
            {cat.label}
          </span>
          {suggestion.status === 'done' ? (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
              ✓ Traité
            </span>
          ) : (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              En attente
            </span>
          )}
          {suggestion.githubIssueNumber && (
            <a
              href={suggestion.githubIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-900 text-white hover:bg-gray-700 transition-colors"
            >
              GitHub #{suggestion.githubIssueNumber}
            </a>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{formatDate(suggestion.createdAt)}</span>
      </div>

      {/* Auteur */}
      <p className="text-xs text-gray-500">
        <span className="font-medium text-gray-700">{suggestion.user?.name || 'Anonyme'}</span>
        {suggestion.user?.email && <span> — {suggestion.user.email}</span>}
      </p>

      {/* Contenu */}
      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{suggestion.content}</p>

      {/* Fichiers */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 truncate max-w-[180px]"
            >
              📎 {f.filename || `Fichier ${i + 1}`}
            </a>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          onClick={() => onToggleStatus(suggestion.id)}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
            suggestion.status === 'pending'
              ? 'border-green-200 text-green-700 hover:bg-green-50'
              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {suggestion.status === 'pending' ? '✓ Marquer traité' : '↩ Remettre en attente'}
        </button>

        <button
          onClick={handleConvert}
          disabled={converting}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {converting ? '…' : suggestion.githubIssueNumber ? '↗ Recréer issue' : '↗ Créer issue GitHub'}
        </button>

        <button
          onClick={() => {
            if (window.confirm('Supprimer définitivement cette suggestion ?')) onDelete(suggestion.id);
          }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-100 text-red-600 hover:bg-red-50 transition-colors ml-auto"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

export default function AdminSuggestionsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'done'
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const debounceRef = useRef(null);

  const fetchSuggestions = useCallback(async (q, status) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (q && q.trim()) params.set('search', q.trim());
      const { data } = await api.get(`/admin/suggestions?${params}`);
      setSuggestions(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des suggestions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions(search, activeTab);
  }, [activeTab, fetchSuggestions]);

  function handleSearchChange(value) {
    setSearch(value);
    // Sync URL
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set('search', value.trim());
    else params.delete('search');
    setSearchParams(params, { replace: true });
    // Debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value, activeTab), 300);
  }

  async function handleToggleStatus(id) {
    try {
      const { data } = await api.patch(`/admin/suggestions/${id}/status`);
      setSuggestions(prev => prev.map(s => s.id === id ? data : s));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  }

  async function handleDelete(id) {
    try {
      await api.delete(`/admin/suggestions/${id}`);
      setSuggestions(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  }

  async function handleConvertToIssue(id, force) {
    try {
      const { data } = await api.post(`/admin/suggestions/${id}/convert-to-issue`, { force });
      setSuggestions(prev => prev.map(s => s.id === id ? data : s));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la création de l\'issue GitHub');
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/login');
  }

  const pendingCount = suggestions.filter(s => s.status === 'pending').length;
  const doneCount    = suggestions.filter(s => s.status === 'done').length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-bold text-gray-900 hover:text-amber-600 transition-colors">
            🗺 PlanYourTrip
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link to="/admin/suggestions" className="px-3 py-1.5 rounded-lg font-medium text-amber-700 bg-amber-50 transition-colors">
              Suggestions
            </Link>
            <Link to="/admin/users" className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              Utilisateurs
            </Link>
            <Link to="/admin/devhub" className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              Dev Hub
            </Link>
          </div>
        </div>
        <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
          Déconnexion
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suggestions utilisateurs</h1>
          <p className="text-sm text-gray-500 mt-1">Gérez les retours et suggestions, créez des issues GitHub.</p>
        </div>

        {/* Searchbar */}
        <div className="relative">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Rechercher par contenu, nom ou email…"
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          {search && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-700 text-sm"
            >
              ✕
            </button>
          )}
        </div>

        {/* Onglets */}
        <div className="flex gap-2 border-b border-gray-200">
          {[
            { key: 'pending', label: 'En attente', count: pendingCount },
            { key: 'done',    label: 'Traitées',   count: doneCount },
            { key: 'all',     label: 'Toutes',     count: suggestions.length },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-amber-500 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {!loading && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
            <span className="text-3xl">💬</span>
            <p className="text-sm">Aucune suggestion trouvée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map(suggestion => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onToggleStatus={handleToggleStatus}
                onDelete={handleDelete}
                onConvertToIssue={handleConvertToIssue}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
