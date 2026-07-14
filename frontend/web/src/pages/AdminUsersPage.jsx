import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api.js';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function EditUserModal({ user, onClose, onSave }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.patch(`/admin/users/${user.id}`, { name, email, isAdmin });
      onSave(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Modifier l'utilisateur</h2>
          <p className="text-sm text-gray-400 mt-0.5">{user.id}</p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Prénom ou nom d'affichage"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="isAdmin"
              checked={isAdmin}
              onChange={e => setIsAdmin(e.target.checked)}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <label htmlFor="isAdmin" className="text-sm text-gray-700">Administrateur</label>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const currentUserId = (() => {
    try {
      const token = localStorage.getItem('token');
      return JSON.parse(atob(token.split('.')[1])).userId;
    } catch { return null; }
  })();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/users');
      setUsers(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/login');
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/admin/users/${confirmDelete.id}`);
      setUsers(prev => prev.filter(u => u.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggleVerified(user) {
    const newVerified = !user.emailVerifiedAt;
    try {
      const { data } = await api.patch(`/admin/users/${user.id}`, { verified: newVerified });
      setUsers(prev => prev.map(u => u.id === data.id ? data : u));
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  }

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return !q || u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-sm font-bold text-gray-900 hover:text-amber-600 transition-colors">
            🗺 PlanYourTrip
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link to="/admin/suggestions" className="px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              Suggestions
            </Link>
            <Link to="/admin/users" className="px-3 py-1.5 rounded-lg font-medium text-amber-700 bg-amber-50 transition-colors">
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

      <main className="max-w-5xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
            <p className="text-sm text-gray-500 mt-1">
              {filtered.length} / {users.length} utilisateur{users.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={fetchUsers}
            className="text-sm bg-white border border-gray-200 rounded-lg px-4 py-2 hover:bg-gray-50 transition"
          >
            ↻ Actualiser
          </button>
        </div>

        {/* Recherche */}
        <div className="mb-4">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            className="w-full max-w-sm border border-gray-200 bg-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>

        {/* Erreur */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        {/* Tableau */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-amber-400 border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">Aucun utilisateur trouvé</div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Utilisateur</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Email vérifié</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Roadtrips</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Inscrit le</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 uppercase tracking-wide text-xs">Rôle</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50/60 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                          {(user.name?.[0] || user.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{user.name || <span className="text-gray-400 italic">Sans nom</span>}</div>
                          <div className="text-gray-400 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleVerified(user)}
                        className={`text-xs px-2 py-1 rounded-full font-semibold transition ${
                          user.emailVerifiedAt
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
                        }`}
                      >
                        {user.emailVerifiedAt ? '✓ Vérifié' : 'Non vérifié'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{user._count.roadtrips}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      {user.isAdmin
                        ? <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2 py-0.5 rounded-full">Admin</span>
                        : <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">Utilisateur</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition text-gray-600"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => setConfirmDelete(user)}
                          disabled={user.id === currentUserId}
                          className="text-xs px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50 transition text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Modal édition */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSave={(updated) => {
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
            setEditingUser(null);
          }}
        />
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Supprimer l'utilisateur ?</h2>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{confirmDelete.name || confirmDelete.email}</strong>
            </p>
            <p className="text-sm text-red-600 mb-4">
              Cette action est irréversible. Tous ses roadtrips, étapes et données seront supprimés.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
