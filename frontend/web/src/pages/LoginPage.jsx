import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function switchMode(m) {
    setMode(m);
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login' ? { email, password } : { email, password, name };
      const { data } = await api.post(endpoint, payload);
      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || (mode === 'login' ? 'Identifiants invalides' : 'Erreur lors de l\'inscription'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white shadow-md rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-serif font-bold text-center mb-6 text-gray-900">
          PlanYourTrip
        </h1>

        {/* Toggle */}
        <div className="flex rounded-lg border border-gray-200 p-1 mb-6">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${mode === 'login' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-md transition ${mode === 'register' ? 'bg-brand text-white' : 'text-gray-500 hover:text-gray-800'}`}
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Votre prénom ou pseudo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand text-white font-semibold py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? '…' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </button>
        </form>
      </div>
    </div>
  );
}
