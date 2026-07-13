import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../api.js';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Brouillon' },
  { value: 'PLANNED', label: 'Planifié' },
  { value: 'ONGOING', label: 'En cours' },
  { value: 'COMPLETED', label: 'Terminé' },
];

export default function RoadtripFormPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ title: '', startDate: '', endDate: '', status: 'DRAFT' });
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/roadtrips/${id}`).then(({ data }) => {
      setForm({
        title: data.title || '',
        startDate: data.startDate ? data.startDate.substring(0, 10) : '',
        endDate: data.endDate ? data.endDate.substring(0, 10) : '',
        status: data.status || 'DRAFT',
      });
    }).catch(() => navigate('/')).finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: form.status,
      };
      if (isEdit) {
        await api.patch(`/roadtrips/${id}`, payload);
        navigate(`/roadtrips/${id}`);
      } else {
        const { data } = await api.post('/roadtrips', payload);
        navigate(`/roadtrips/${data.id}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Une erreur est survenue');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer définitivement ce roadtrip et toutes ses étapes ?')) return;
    setDeleting(true);
    try {
      await api.delete(`/roadtrips/${id}`);
      navigate('/');
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur lors de la suppression');
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Chargement…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate(isEdit ? `/roadtrips/${id}` : '/')} className="text-gray-500 hover:text-gray-800 text-lg">
            ‹
          </button>
          <h1 className="text-xl font-serif font-bold text-gray-900">
            {isEdit ? 'Modifier le roadtrip' : 'Nouveau roadtrip'}
          </h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={set('title')}
              placeholder="Ex: Road trip en Islande"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
              <input
                type="date"
                value={form.endDate}
                onChange={set('endDate')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
            <select
              value={form.status}
              onChange={set('status')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand bg-white"
            >
              {STATUS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {isEdit ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-red-600 text-sm font-semibold hover:underline disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            ) : <div />}

            <button
              type="submit"
              disabled={saving}
              className="bg-brand text-white font-semibold px-6 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
