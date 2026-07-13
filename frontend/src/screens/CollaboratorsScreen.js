import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useRoadtripRole } from '../hooks/useRoadtripRole';
import API_URL from '../api/config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INITIALS_COLORS = ['#2D6A4F', '#1D3557', '#6B3A2A', '#4A1942', '#1B4332', '#7B3F00'];

function getInitialsColor(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return INITIALS_COLORS[Math.abs(h) % INITIALS_COLORS.length];
}

function getInitials(name) {
  const words = (name || '').trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + (words[1][0] || '')).toUpperCase();
}

function getRoleBadgeColor(role) {
  if (role === 'OWNER') return COLORS.accent;
  if (role === 'EDITOR') return '#1D6FA5';
  return COLORS.textMuted;
}

function getRoleLabel(role) {
  if (role === 'OWNER') return 'Organisateur';
  if (role === 'EDITOR') return 'Éditeur';
  return 'Lecteur';
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

function MemberRow({ member, isOwner, onEdit, onRemove }) {
  const displayName = member.user?.name || member.email;
  const initials = getInitials(displayName);
  const color = getInitialsColor(displayName);
  const badgeColor = getRoleBadgeColor(member.role);
  const isPending = member.status === 'PENDING';

  return (
    <View style={styles.memberRow}>
      <View style={[styles.memberAvatar, { backgroundColor: color }]}>
        <Text style={styles.memberAvatarText}>{initials}</Text>
      </View>
      <View style={styles.memberInfo}>
        <Text style={styles.memberName} numberOfLines={1}>{displayName}</Text>
        {member.user?.name && <Text style={styles.memberEmail} numberOfLines={1}>{member.email}</Text>}
        {isPending && <Text style={styles.memberPending}>En attente d'acceptation</Text>}
      </View>
      <View style={[styles.roleBadge, { borderColor: badgeColor }]}>
        <Text style={[styles.roleBadgeText, { color: badgeColor }]}>{getRoleLabel(member.role)}</Text>
      </View>
      {isOwner && member.role !== 'OWNER' && (
        isPending ? (
          <TouchableOpacity onPress={() => onRemove(member)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionBtnDanger}>🗑️</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => onEdit(member)} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.actionBtnText}>✏️</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CollaboratorsScreen({ route, navigation }) {
  const { roadtripId } = route.params;
  const token = useAuthStore(s => s.token);
  const { isOwner, isLoading: roleLoading } = useRoadtripRole(roadtripId);
  const { bottom } = useSafeAreaInsets();

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('EDITOR');
  const [inviting, setInviting] = useState(false);

  // Edit role modal
  const [editMember, setEditMember] = useState(null);
  const [editRole, setEditRole] = useState('EDITOR');
  const [editing, setEditing] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (e) {
      console.warn('[CollaboratorsScreen] fetchMembers error', e.message);
    } finally {
      setLoading(false);
    }
  }, [roadtripId, token]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return Alert.alert('Email requis', 'Veuillez saisir un email.');
    setInviting(true);
    try {
      const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
      });
      if (res.ok) {
        setInviteVisible(false);
        setInviteEmail('');
        setInviteRole('EDITOR');
        await fetchMembers();
      } else {
        const err = await res.json();
        Alert.alert('Erreur', err.error || 'Impossible d\'inviter ce membre.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur.');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!editMember) return;
    setEditing(true);
    try {
      const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/members/${editMember.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: editRole }),
      });
      if (res.ok) {
        setEditMember(null);
        await fetchMembers();
      } else {
        const err = await res.json();
        Alert.alert('Erreur', err.error || 'Impossible de modifier le rôle.');
      }
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur.');
    } finally {
      setEditing(false);
    }
  };

  const handleRemove = (member) => {
    Alert.alert(
      'Retirer ce membre ?',
      `${member.user?.name || member.email} sera retiré du roadtrip.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Retirer', style: 'destructive', onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/roadtrips/${roadtripId}/members/${member.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) await fetchMembers();
            else Alert.alert('Erreur', 'Impossible de retirer ce membre.');
          } catch {
            Alert.alert('Erreur', 'Impossible de contacter le serveur.');
          }
        }},
      ]
    );
  };

  const ownerMember = members.find(m => m.role === 'OWNER');
  const acceptedMembers = members.filter(m => m.role !== 'OWNER' && m.status === 'ACCEPTED');
  const pendingMembers = members.filter(m => m.status === 'PENDING');

  const isEmpty = acceptedMembers.length === 0 && pendingMembers.length === 0;

  if (loading || roleLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color={COLORS.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collaborateurs</Text>
        {isOwner && (
          <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviteVisible(true)}>
            <Text style={styles.inviteBtnText}>+ Inviter</Text>
          </TouchableOpacity>
        )}
        {!isOwner && <View style={{ width: 72 }} />}
      </View>

      {/* ─── Bandeau non-owner ──────────────────────────────────────────── */}
      {!isOwner && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>🔒 Seul l'organisateur peut gérer les membres</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ─── Organisateur ─────────────────────────────────────────────── */}
        {ownerMember && (
          <>
            <Text style={styles.sectionLabel}>ORGANISATEUR</Text>
            <MemberRow
              member={ownerMember}
              isOwner={false}
              onEdit={() => {}}
              onRemove={() => {}}
            />
          </>
        )}

        {/* ─── Membres ──────────────────────────────────────────────────── */}
        {acceptedMembers.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>MEMBRES ({acceptedMembers.length})</Text>
            {acceptedMembers.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                isOwner={isOwner}
                onEdit={(member) => { setEditMember(member); setEditRole(member.role); }}
                onRemove={handleRemove}
              />
            ))}
          </>
        )}

        {/* ─── En attente ───────────────────────────────────────────────── */}
        {pendingMembers.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>EN ATTENTE ({pendingMembers.length})</Text>
            {pendingMembers.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                isOwner={isOwner}
                onEdit={() => {}}
                onRemove={handleRemove}
              />
            ))}
          </>
        )}

        {/* ─── Voyage en solo ────────────────────────────────────────────── */}
        {isEmpty && (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🧳</Text>
            <Text style={styles.emptyTitle}>Voyage en solo pour l'instant</Text>
            {isOwner && (
              <>
                <Text style={styles.emptyText}>Invitez des amis ou de la famille à collaborer sur ce roadtrip.</Text>
                <TouchableOpacity style={styles.emptyInviteBtn} onPress={() => setInviteVisible(true)}>
                  <Text style={styles.emptyInviteBtnText}>+ Inviter un membre</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={{ height: Math.max(bottom, 24) }} />
      </ScrollView>

      {/* ─── Modal invitation ────────────────────────────────────────────── */}
      <Modal visible={inviteVisible} transparent animationType="slide" onRequestClose={() => setInviteVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={styles.modalOverlay} onPress={() => setInviteVisible(false)}>
            <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(bottom, 16) }]} onPress={() => {}}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Inviter un membre</Text>

              <Text style={styles.inputLabel}>Adresse email</Text>
              <TextInput
                style={styles.input}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="ami@exemple.com"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.inputLabel}>Rôle</Text>
              <View style={styles.roleSelector}>
                <TouchableOpacity
                  style={[styles.roleOption, inviteRole === 'EDITOR' && styles.roleOptionActive]}
                  onPress={() => setInviteRole('EDITOR')}
                >
                  <Text style={[styles.roleOptionText, inviteRole === 'EDITOR' && styles.roleOptionTextActive]}>✏️ Éditeur</Text>
                  <Text style={styles.roleOptionDesc}>Peut modifier le voyage</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleOption, inviteRole === 'VIEWER' && styles.roleOptionActive]}
                  onPress={() => setInviteRole('VIEWER')}
                >
                  <Text style={[styles.roleOptionText, inviteRole === 'VIEWER' && styles.roleOptionTextActive]}>👁 Lecteur</Text>
                  <Text style={styles.roleOptionDesc}>Peut voir le voyage</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.confirmBtn, inviting && styles.confirmBtnDisabled]}
                onPress={handleInvite}
                disabled={inviting}
              >
                {inviting ? (
                  <ActivityIndicator color={COLORS.bg} size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Inviter</Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Modal changement de rôle ────────────────────────────────────── */}
      <Modal visible={!!editMember} transparent animationType="slide" onRequestClose={() => setEditMember(null)}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditMember(null)}>
          <Pressable style={[styles.modalSheet, { paddingBottom: Math.max(bottom, 16) }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{editMember?.user?.name || editMember?.email}</Text>

            <Text style={styles.inputLabel}>Changer le rôle</Text>
            <View style={styles.roleSelector}>
              <TouchableOpacity
                style={[styles.roleOption, editRole === 'EDITOR' && styles.roleOptionActive]}
                onPress={() => setEditRole('EDITOR')}
              >
                <Text style={[styles.roleOptionText, editRole === 'EDITOR' && styles.roleOptionTextActive]}>✏️ Éditeur</Text>
                <Text style={styles.roleOptionDesc}>Peut modifier le voyage</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleOption, editRole === 'VIEWER' && styles.roleOptionActive]}
                onPress={() => setEditRole('VIEWER')}
              >
                <Text style={[styles.roleOptionText, editRole === 'VIEWER' && styles.roleOptionTextActive]}>👁 Lecteur</Text>
                <Text style={styles.roleOptionDesc}>Peut voir le voyage</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, editing && styles.confirmBtnDisabled]}
              onPress={handleUpdateRole}
              disabled={editing}
            >
              {editing ? (
                <ActivityIndicator color={COLORS.bg} size="small" />
              ) : (
                <Text style={styles.confirmBtnText}>Enregistrer</Text>
              )}
            </TouchableOpacity>

            <View style={styles.modalDivider} />

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => { setEditMember(null); handleRemove(editMember); }}
            >
              <Text style={styles.removeBtnText}>🗑️ Retirer du voyage</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  loader: { flex: 1, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { color: COLORS.text, fontSize: 28, fontWeight: '600', lineHeight: 32 },
  headerTitle: { fontFamily: FONTS.title, fontSize: 22, color: COLORS.text, flex: 1, textAlign: 'center' },
  inviteBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
  },
  inviteBtnText: { color: COLORS.bg, fontSize: 13, fontWeight: '700' },

  // Locked banner
  lockedBanner: {
    backgroundColor: 'rgba(232,84,53,0.08)', borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  lockedBannerText: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },

  scroll: { padding: SPACING.lg },

  // Section label
  sectionLabel: {
    fontSize: 11, letterSpacing: 2, color: COLORS.textMuted,
    marginBottom: SPACING.sm, marginTop: SPACING.md,
  },

  // Member row
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.sm,
  },
  memberAvatar: {
    width: 44, height: 44, borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  memberAvatarText: { fontFamily: FONTS.title, fontSize: 17, color: '#fff' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 1 },
  memberEmail: { fontSize: 12, color: COLORS.textMuted },
  memberPending: { fontSize: 11, color: COLORS.warning, marginTop: 2, fontStyle: 'italic' },
  roleBadge: {
    borderWidth: 1, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  actionBtn: { paddingLeft: SPACING.sm },
  actionBtnText: { fontSize: 18 },
  actionBtnDanger: { fontSize: 18 },

  // Empty state
  empty: { alignItems: 'center', paddingTop: SPACING.xxl },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { fontFamily: FONTS.title, fontSize: 22, color: COLORS.text, marginBottom: SPACING.sm },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center', marginBottom: SPACING.lg },
  emptyInviteBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  emptyInviteBtnText: { color: COLORS.bg, fontSize: 15, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md },
  modalTitle: { fontFamily: FONTS.title, fontSize: 22, color: COLORS.text, marginBottom: SPACING.lg },
  modalDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.md },

  // Form
  inputLabel: { fontSize: 12, letterSpacing: 1, color: COLORS.textMuted, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md, padding: SPACING.md,
    color: COLORS.text, fontSize: 15, marginBottom: SPACING.lg,
  },
  roleSelector: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
  roleOption: {
    flex: 1, padding: SPACING.md, borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  roleOptionActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentDim },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, marginBottom: 4 },
  roleOptionTextActive: { color: COLORS.accent },
  roleOptionDesc: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },

  // Buttons
  confirmBtn: {
    backgroundColor: COLORS.accent, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: COLORS.bg, fontSize: 16, fontWeight: '700' },
  removeBtn: { padding: SPACING.md, alignItems: 'center' },
  removeBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '600' },
});
