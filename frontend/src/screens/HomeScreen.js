import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl,
  Modal, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { COLORS, FONTS, RADIUS, SPACING, ROADTRIP_STATUS } from '../theme';
import { useAuthStore } from '../store/authStore';
import { useRoadtrips } from '../hooks/usePowerSync';
import { db } from '../powersync/db';
import { AppConnector } from '../powersync/connector';
import BetaFeedbackModal from '../components/BetaFeedbackModal';
import SuggestionFAB from '../components/SuggestionFAB';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INITIALS_COLORS = ['#2D6A4F','#1D3557','#6B3A2A','#4A1942','#1B4332','#7B3F00'];


function getInitialsColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return INITIALS_COLORS[Math.abs(h) % INITIALS_COLORS.length];
}
function getInitials(title) {
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + (words[1][0] || '')).toUpperCase();
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
function durationDays(start, end) {
  if (!start || !end) return null;
  const d = Math.round((new Date(end) - new Date(start)) / 86400000);
  return d > 0 ? d : null;
}
function formatDate(dateStr, opts = { day: 'numeric', month: 'short' }) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('fr-FR', opts);
}
function planningPercent(rt) {
  const base = { DRAFT: 15, PLANNED: 65, ONGOING: 85, COMPLETED: 100 };
  return base[rt.status] ?? 15;
}
function nextUpcoming(roadtrips) {
  const upcoming = roadtrips
    .filter(r => r.startDate && (r.status === 'PLANNED' || r.status === 'ONGOING'))
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return upcoming[0] ?? roadtrips[0] ?? null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status, dark }) {
  const cfg = ROADTRIP_STATUS[status] || ROADTRIP_STATUS.DRAFT;
  return (
    <View style={[styles.badge, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : cfg.bg }]}>
      {dark && <View style={[styles.badgeDot, { backgroundColor: cfg.color }]} />}
      <Text style={[styles.badgeText, { color: dark ? COLORS.text : cfg.color }]}>
        {cfg.label.toUpperCase()}
      </Text>
    </View>
  );
}

function FeaturedCard({ roadtrip, onPress }) {
  const pct = planningPercent(roadtrip);
  const dateRange = roadtrip.startDate
    ? `${formatDate(roadtrip.startDate)} – ${formatDate(roadtrip.endDate) ?? '?'}`
    : null;
  const dur = durationDays(roadtrip.startDate, roadtrip.endDate);
  const steps = Number(roadtrip.stepCount ?? 0);
  const days = daysUntil(roadtrip.startDate);
  const words = roadtrip.title.trim().split(' ');
  const midIdx = Math.max(1, Math.floor(words.length / 2));
  const titleStart = words.slice(0, midIdx).join(' ');
  const titleEnd = words.slice(midIdx).join(' ');

  return (
    <TouchableOpacity style={styles.featuredCard} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.featuredBg}>
        <View style={styles.mountain1} />
        <View style={styles.mountain2} />
      </View>
      <View style={styles.featuredTop}>
        <StatusBadge status={roadtrip.status} dark />
        {days !== null && days >= 0 && (
          <View style={styles.countdownBadge}>
            <Text style={styles.countdownNum}>{days}</Text>
            <Text style={styles.countdownUnit}>jours</Text>
          </View>
        )}
      </View>
      <Text style={styles.featuredTitle}>
        {titleStart}
        {titleEnd ? <Text style={styles.featuredTitleItalic}>{' ' + titleEnd}</Text> : null}
      </Text>
      <View style={styles.featuredMeta}>
        {dateRange && <Text style={styles.featuredMetaText}>📅 {dateRange}</Text>}
        {steps > 0 && <Text style={styles.featuredMetaText}>📍 {steps} étape{steps !== 1 ? 's' : ''}</Text>}
        {dur && <Text style={styles.featuredMetaText}>→ {dur} jours</Text>}
      </View>
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>PLANIFICATION</Text>
        <Text style={styles.progressPct}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
    </TouchableOpacity>
  );
}

function NextDepartureBanner({ roadtrip }) {
  const days = daysUntil(roadtrip.startDate);
  if (days === null || days < 0) return null;
  return (
    <View style={styles.banner}>
      <View style={styles.bannerLeft}>
        <View style={styles.bannerIcon}>
          <Text style={{ fontSize: 18 }}>🕐</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerLabel}>PROCHAIN DÉPART</Text>
          <Text style={styles.bannerTitle} numberOfLines={1}>{roadtrip.title}</Text>
        </View>
      </View>
      <View style={styles.bannerBadge}>
        <Text style={styles.bannerBadgeNum}>{days}</Text>
        <Text style={styles.bannerBadgeUnit}>jours</Text>
      </View>
    </View>
  );
}

function RoadtripRow({ item, onPress }) {
  const initials = getInitials(item.title);
  const color = getInitialsColor(item.title);
  const dateText = item.startDate
    ? new Date(item.startDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : 'Non daté';
  const dur = durationDays(item.startDate, item.endDate);
  const steps = Number(item.stepCount ?? 0);

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.rowInitials, { backgroundColor: color }]}>
        <Text style={styles.rowInitialsText}>{initials}</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.rowMeta}>{dateText}{dur ? ` · ${dur} jours` : ''}</Text>
        <View style={styles.rowFooter}>
          <StatusBadge status={item.status} />
          {steps > 0 && <Text style={styles.rowSteps}>{steps} étape{steps !== 1 ? 's' : ''}</Text>}
          {item.userRole && item.userRole !== 'OWNER' && (
            <View style={styles.sharedBadge}>
              <Text style={styles.sharedBadgeText}>👥 Partagé</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.rowArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── User menu ──────────────────────────────────────────────────────────────

function UserMenu({ visible, onClose, onLogout }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={menuStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[menuStyles.sheet, { paddingBottom: Math.max(bottom, 16) }]}>
              <View style={menuStyles.handle} />

              <Text style={menuStyles.title}>Mon compte</Text>

              {/* Futures rubriques ici */}

              <View style={menuStyles.divider} />

              <TouchableOpacity style={menuStyles.item} onPress={onLogout}>
                <Text style={menuStyles.itemIconDanger}>⎋</Text>
                <Text style={menuStyles.itemLabelDanger}>Déconnexion</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const menuStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontFamily: FONTS.title,
    fontSize: 22,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  itemIconDanger: { fontSize: 20, color: COLORS.error },
  itemLabelDanger: {
    fontSize: 16,
    color: COLORS.error,
    fontWeight: '600',
  },
});

// ─── Tab bar ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'home',     icon: '⌂', label: 'Accueil' },
  { key: 'map',      icon: '◎', label: 'Carte' },
  { key: 'planning', icon: '▦', label: 'Planning' },
  { key: 'profile',  icon: '◯', label: 'Profil' },
];

function TabBar({ active }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(bottom, 8) }]}>
      {TABS.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tabItem}
          onPress={() => tab.key !== 'home' && Alert.alert('Bientôt disponible', `L'écran "${tab.label}" arrive prochainement.`)}
        >
          <Text style={[styles.tabIcon, active === tab.key && styles.tabIconActive]}>{tab.icon}</Text>
          <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>{tab.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { user, logout, token } = useAuthStore();
  const { roadtrips, isLoading, refreshShared } = useRoadtrips();
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  // Rafraîchir les roadtrips partagés à chaque focus de l'écran
  useFocusEffect(
    useCallback(() => {
      refreshShared();
    }, [refreshShared])
  );
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const connector = new AppConnector(() => Promise.resolve(token));
      await db.connect(connector);
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (e) {
      console.warn('[Refresh]', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const featured = nextUpcoming(roadtrips);
  const otherRoadtrips = roadtrips.filter(r => r.id !== featured?.id);
  const ownedOtherRoadtrips = otherRoadtrips.filter(r => !r.userRole || r.userRole === 'OWNER');
  const sharedOtherRoadtrips = otherRoadtrips.filter(r => r.userRole && r.userRole !== 'OWNER');
  const { bottom: bottomInset } = useSafeAreaInsets();
  const tabBarHeight = 54 + Math.max(bottomInset, 8);

  const goToRoadtrip = (item) => navigation.navigate('RoadtripDetail', {
    id: item.id,
    title: item.title,
    userRole: item.userRole ?? 'OWNER',
    roadtripData: item,
  });

  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || '';
  const firstName = displayName.split(/[\s&]+/)[0]?.trim() ?? '';
  const restName = displayName.slice(firstName.length);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.accent}
            colors={[COLORS.accent]}
          />
        }
      >

        {/* ─── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>BONJOUR 🔥</Text>
            {displayName ? (
              <Text style={styles.heroName}>
                {firstName}
                {restName ? <Text style={styles.heroNameItalic}>{restName}</Text> : null}
              </Text>
            ) : null}
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity>
              <Text style={styles.iconBtnText}>🔔</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.userPillAvatar} onPress={() => setMenuVisible(true)}>
              <Text style={styles.userPillInitial}>{(displayName?.[0] ?? '?').toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && roadtrips.length === 0 ? (
          <View style={styles.loader}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        ) : roadtrips.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🗺</Text>
            <Text style={styles.emptyTitle}>Aucun roadtrip</Text>
            <Text style={styles.emptyText}>Appuyez sur + pour créer votre premier voyage.</Text>
          </View>
        ) : (
          <>
            {/* ─── Voyage à venir ───────────────────────────────────────── */}
            {featured && (
              <>
                <Text style={styles.sectionLabel}>VOYAGE À VENIR</Text>
                <FeaturedCard roadtrip={featured} onPress={() => goToRoadtrip(featured)} />
              </>
            )}

            {/* ─── Autres roadtrips ─────────────────────────────────────── */}
            {ownedOtherRoadtrips.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>MES ROADTRIPS</Text>
                {ownedOtherRoadtrips.map(item => (
                  <RoadtripRow
                    key={item.id}
                    item={item}
                    onPress={() => goToRoadtrip(item)}
                  />
                ))}
              </>
            )}

            {/* ─── Roadtrips partagés ───────────────────────────────────── */}
            {sharedOtherRoadtrips.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>PARTAGÉS AVEC MOI</Text>
                {sharedOtherRoadtrips.map(item => (
                  <RoadtripRow
                    key={item.id}
                    item={item}
                    onPress={() => goToRoadtrip(item)}
                  />
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ─── FAB ──────────────────────────────────────────────────────────── */}
      <TouchableOpacity style={[styles.fab, { bottom: tabBarHeight + 12 }]} onPress={() => navigation.navigate('CreateRoadtrip')}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* ─── Beta FAB ─────────────────────────────────────────────────────── */}
      <TouchableOpacity style={[styles.betaFab, { bottom: tabBarHeight + 12 }]} onPress={() => setFeedbackVisible(true)}>
        <Text style={styles.betaFabText}>💬</Text>
      </TouchableOpacity>

      {/* ─── Suggestion FAB ───────────────────────────────────────────────── */}
      <SuggestionFAB bottom={tabBarHeight + 60} left={16} />

      {/* ─── Tab bar ──────────────────────────────────────────────────────── */}
      <TabBar active="home" />

      {/* ─── User menu ────────────────────────────────────────────────────── */}
      <UserMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onLogout={() => { setMenuVisible(false); logout(); }}
      />

      {/* ─── Beta Feedback Modal ───────────────────────────────────────────── */}
      <BetaFeedbackModal visible={feedbackVisible} onClose={() => setFeedbackVisible(false)} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: SPACING.lg },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.lg },
  greeting: { fontSize: 11, letterSpacing: 2, color: COLORS.textMuted, marginBottom: 2 },
  heroName: { fontFamily: FONTS.title, fontSize: 36, color: COLORS.text, lineHeight: 42 },
  heroNameItalic: { fontFamily: FONTS.titleItalic, color: COLORS.accent },
  headerIcons: { flexDirection: 'row', gap: SPACING.sm, marginTop: 4 },
  iconBtnText: { fontSize: 22 },
  userPillAvatar: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userPillInitial: { fontFamily: FONTS.title, fontSize: 15, color: COLORS.bg },
  userPillName: {
    marginLeft: SPACING.xs,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flexShrink: 1,
  },
  userPillChevron: { marginLeft: 3, fontSize: 11, color: COLORS.textMuted },

  // Loader / Empty
  loader: { paddingTop: 80, alignItems: 'center' },
  empty: { paddingTop: 80, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: SPACING.md },
  emptyTitle: { fontFamily: FONTS.title, fontSize: 24, color: COLORS.text, marginBottom: SPACING.xs },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },

  // Banner "Prochain départ"
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.lg,
    borderLeftWidth: 3, borderLeftColor: COLORS.accent,
  },
  bannerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  bannerIcon: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  bannerLabel: { fontSize: 10, letterSpacing: 1.5, color: COLORS.textMuted, marginBottom: 2 },
  bannerTitle: { fontFamily: FONTS.titleRegular, fontSize: 16, color: COLORS.text },
  bannerBadge: { alignItems: 'center', marginLeft: SPACING.md },
  bannerBadgeNum: { fontFamily: FONTS.title, fontSize: 28, color: COLORS.accent, lineHeight: 30 },
  bannerBadgeUnit: { fontSize: 11, color: COLORS.textMuted, letterSpacing: 0.5 },

  // Section label
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: COLORS.textMuted, marginBottom: SPACING.sm, marginTop: SPACING.xs },

  // Featured card
  featuredCard: {
    backgroundColor: '#0D1F14', borderRadius: RADIUS.xl,
    padding: SPACING.lg, marginBottom: SPACING.xl, overflow: 'hidden', minHeight: 200,
  },
  featuredBg: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 100 },
  mountain1: {
    position: 'absolute', bottom: 0, left: -20, width: 0, height: 0,
    borderLeftWidth: 140, borderRightWidth: 140, borderBottomWidth: 100,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#122010',
  },
  mountain2: {
    position: 'absolute', bottom: 0, right: -10, width: 0, height: 0,
    borderLeftWidth: 120, borderRightWidth: 80, borderBottomWidth: 80,
    borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#0A1A0A',
  },
  featuredTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  countdownBadge: {
    alignItems: 'center',
    backgroundColor: COLORS.accentDim,
    borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    minWidth: 52,
  },
  countdownNum: { fontFamily: FONTS.title, fontSize: 26, color: COLORS.accent, lineHeight: 28 },
  countdownUnit: { fontSize: 10, color: COLORS.accent, letterSpacing: 1 },
  featuredTitle: { fontFamily: FONTS.title, fontSize: 32, color: '#F2EFE8', lineHeight: 36, marginBottom: SPACING.sm },
  featuredTitleItalic: { fontFamily: FONTS.titleItalic, color: COLORS.accent },
  featuredMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginBottom: SPACING.md },
  featuredMetaText: { color: 'rgba(242,239,232,0.6)', fontSize: 13 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 10, letterSpacing: 1.5, color: 'rgba(242,239,232,0.4)' },
  progressPct: { fontSize: 10, letterSpacing: 1, color: COLORS.accent },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: RADIUS.full },
  progressFill: { height: 3, backgroundColor: COLORS.accent, borderRadius: RADIUS.full },

  // Badge
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4, gap: 5 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },

  // Row (list item)
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowInitials: {
    width: 48, height: 48, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowInitialsText: { fontFamily: FONTS.title, fontSize: 18, color: '#fff' },
  rowContent: { flex: 1 },
  rowTitle: { fontFamily: FONTS.titleRegular, fontSize: 17, color: COLORS.text, marginBottom: 2 },
  rowMeta: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  rowFooter: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowSteps: { fontSize: 11, color: COLORS.textMuted },
  rowArrow: { fontSize: 22, color: COLORS.textDim, flexShrink: 0 },
  sharedBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(78,168,222,0.12)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  sharedBadgeText: { fontSize: 10, color: '#4EA8DE', fontWeight: '700' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: 10,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2 },
  tabIcon: { fontSize: 20, color: COLORS.textMuted },
  tabIconActive: { color: COLORS.accent },
  tabLabel: { fontSize: 10, color: COLORS.textMuted },
  tabLabelActive: { color: COLORS.accent, fontWeight: '600' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 78, // overridden dynamically
    right: SPACING.lg,
    width: 52, height: 52, borderRadius: RADIUS.full, backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabText: { color: COLORS.bg, fontSize: 26, fontWeight: '300', lineHeight: 30 },

  // Beta FAB
  betaFab: {
    position: 'absolute',
    bottom: 78, // overridden dynamically
    left: SPACING.lg,
    width: 40, height: 40, borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  betaFabText: { fontSize: 18 },
});
