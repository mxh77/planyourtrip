import React, { useEffect, useState, useCallback } from 'react';
import api from '../api.js';

const ROLE_OPTIONS = [
  { value: 'EDITOR', label: 'Éditeur' },
  { value: 'VIEWER', label: 'Lecteur' },
];
const ROLE_LABELS = { OWNER: 'Organisateur', EDITOR: 'Éditeur', VIEWER: 'Lecteur' };
const ROLE_COLORS = {
  OWNER: 'bg-amber-100 text-amber-800',
  EDITOR: 'bg-blue-100 text-blue-800',
  VIEWER: 'bg-gray-100 text-gray-600',
};

function getInitials(name) {
  const words = (name || '').trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + (words[1][0] || '')).toUpperCase();
}

export default function CollaboratorsPanel({ roadtripId, isOwner }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('EDITOR');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');

  const fetchMembers = useCallback(async () => {
    setFetchError('');
    try {
      const { data } = await api.get(`/roadtrips/${roadtripId}/members`);
      setMembers(data);
    } catch (err) {
      console.error(err);
      setFetchError(err.response?.data?.error || `Erreur ${err.response?.status || 'réseau'}`);
    } finally {
      setLoading(false);
    }
  }, [roadtripId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  async function handleInvite(e) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteError('');
    setInviting(true);
    try {
      await api.post(`/roadtrips/${roadtripId}/members`, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });
      setInviteEmail('');
      fetchMembers();
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Erreur lors de l\'invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(memberId, role) {
    try {
      await api.patch(`/roadtrips/${roadtripId}/members/${memberId}`, { role });
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur');
    }
  }

  async function handleRemove(member) {
    if (!confirm(`Retirer ${member.user?.name || member.email} du roadtrip ?`)) return;
    try {
      await api.delete(`/roadtrips/${roadtripId}/members/${member.id}`);
      fetchMembers();
    } catch (err) {
      alert(err.response?.data?.error || 'Erreur');
    }
  }

  const owner = members.find(m => m.role === 'OWNER');
  const accepted = members.filter(m => m.role !== 'OWNER' && m.status === 'ACCEPTED');
  const pending = members.filter(m => m.status === 'PENDING');

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4 sticky top-20">
      <h3 className="font-semibold text-gray-900 text-sm">Collaborateurs</h3>

      {loading ? (
        <p className="text-gray-400 text-sm">Chargement…</p>
      ) : fetchError ? (
        <p className="text-red-500 text-sm">{fetchError}</p>
      ) : (
        <div className="space-y-4">
          {/* Organisateur */}
          {owner && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Organisateur</p>
              <MemberRow member={owner} />
            </div>
          )}

          {/* Membres */}
          {accepted.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                Membres ({accepted.length})
              </p>
              <div className="space-y-2">
                {accepted.map(m => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isOwner={isOwner}
                    onChangeRole={role => handleChangeRole(m.id, role)}
                    onRemove={() => handleRemove(m)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Invitations en attente */}
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                En attente ({pending.length})
              </p>
              <div className="space-y-2">
                {pending.map(m => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    isOwner={isOwner}
                    isPending
                    onRemove={() => handleRemove(m)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Formulaire d'invitation */}
      {isOwner && (
        <form onSubmit={handleInvite} className="border-t border-gray-100 pt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Inviter</p>
          <input
            type="email"
            placeholder="Email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <div className="flex gap-2">
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              {ROLE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="bg-brand text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {inviting ? '…' : 'Inviter'}
            </button>
          </div>
          {inviteError && <p className="text-red-600 text-xs">{inviteError}</p>}
        </form>
      )}
    </div>
  );
}

function MemberRow({ member, isOwner, isPending, onChangeRole, onRemove }) {
  const displayName = member.user?.name || member.email;
  const initials = getInitials(displayName);

  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{displayName}</p>
        {member.user?.name && <p className="text-xs text-gray-400 truncate">{member.email}</p>}
        {isPending && <p className="text-xs text-amber-600">En attente</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isOwner && member.role !== 'OWNER' && !isPending && (
          <select
            value={member.role}
            onChange={e => onChangeRole(e.target.value)}
            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none"
          >
            {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}
        {!isOwner || member.role === 'OWNER' ? (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]}`}>
            {ROLE_LABELS[member.role]}
          </span>
        ) : null}
        {isOwner && member.role !== 'OWNER' && (
          <button onClick={onRemove} className="text-gray-400 hover:text-red-500 transition text-sm ml-1" title="Retirer">
            ×
          </button>
        )}
      </div>
    </div>
  );
}
