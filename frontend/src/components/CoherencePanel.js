import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal, View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import API_URL from '../api/config';

const { width: SCREEN_W } = Dimensions.get('window');

const SEVERITY_CONFIG = {
  HIGH:   { color: COLORS.error,   bg: COLORS.errorDim,   icon: 'error',      label: 'Bloquant' },
  MEDIUM: { color: COLORS.warning, bg: COLORS.warningDim, icon: 'warning',    label: 'Important' },
  LOW:    { color: '#4EA8DE',      bg: 'rgba(78,168,222,0.15)', icon: 'info', label: 'Info' },
};

const TYPE_LABELS = {
  OVERLAP: 'Chevauchements',
  GAP: 'Trous / Temps morts',
  TIGHT: 'Liaisons tendues',
};

const TYPE_ICONS = {
  OVERLAP: '⚡',
  GAP: '🕳️',
  TIGHT: '⚠️',
};

function IssueCard({ issue, onSelectIssue }) {
  const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.LOW;

  return (
    <TouchableOpacity
      style={[styles.issueCard, { borderLeftColor: cfg.color }]}
      onPress={() => onSelectIssue?.(issue)}
      activeOpacity={0.7}
    >
      <View style={styles.issueHeader}>
        <View style={[styles.severityBadge, { backgroundColor: cfg.bg }]}>
          <MaterialIcons name={cfg.icon} size={14} color={cfg.color} />
          <Text style={[styles.severityLabel, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Text style={styles.issueStep}>{issue.stepName}</Text>
      </View>

      <Text style={styles.issueSummary}>{issue.summary}</Text>
      <Text style={styles.issueDescription}>{issue.description}</Text>

      {issue.overlapMinutes != null && issue.overlapMinutes > 0 && (
        <Text style={styles.issueMeta}>⏱️ {issue.overlapMinutes} min de recouvrement</Text>
      )}
      {issue.gapHours != null && issue.gapHours > 0 && (
        <Text style={styles.issueMeta}>⏱️ {issue.gapHours}h de trou</Text>
      )}
      {issue.estimatedArrivalHour != null && (
        <Text style={styles.issueMeta}>🚐 Arrivée estimée vers {issue.estimatedArrivalHour}h{issue.routeMinutes ? ` · ${issue.routeMinutes} min de route` : ''}</Text>
      )}
      {issue.nights != null && issue.nights > 0 && (
        <Text style={styles.issueMeta}>🌙 {issue.nights} nuit{issue.nights > 1 ? 's' : ''}</Text>
      )}
    </TouchableOpacity>
  );
}

export default function CoherencePanel({ visible, onClose, roadtripId, onSelectIssue, thresholds }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!roadtripId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = useAuthStore.getState().token;
      const res = await fetch(`${API_URL}/api/ai/check-coherence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          roadtripId,
          thresholds: thresholds || {},
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erreur ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [roadtripId, thresholds]);

  useEffect(() => {
    if (visible) {
      runAnalysis();
    } else {
      setResult(null);
      setError(null);
    }
  }, [visible, runAnalysis]);

  const issuesBySeverity = (result?.issues || []).reduce((acc, issue) => {
    if (!acc[issue.severity]) acc[issue.severity] = [];
    acc[issue.severity].push(issue);
    return acc;
  }, {});

  const severityOrder = ['HIGH', 'MEDIUM', 'LOW'];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <MaterialIcons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>🔍 Cohérence du planning</Text>
            {result && (
              <Text style={styles.headerSubtitle}>
                {result.roadtripName}
              </Text>
            )}
          </View>
          <TouchableOpacity onPress={runAnalysis} style={styles.refreshBtn} disabled={loading}>
            <MaterialIcons name="refresh" size={22} color={loading ? COLORS.textDim : COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          {loading && (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={styles.loadingText}>Analyse du planning…</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorWrap}>
              <MaterialIcons name="error-outline" size={40} color={COLORS.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={runAnalysis}>
                <Text style={styles.retryBtnText}>Réessayer</Text>
              </TouchableOpacity>
            </View>
          )}

          {result && !loading && (
            <>
              {/* Stats bar */}
              <View style={styles.statsBar}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{result.stats.totalIssues}</Text>
                  <Text style={styles.statLabel}>Problèmes</Text>
                </View>
                <View style={[styles.statItem, styles.statItemBorder]}>
                  <Text style={[styles.statNumber, { color: COLORS.error }]}>{result.stats.bySeverity.HIGH}</Text>
                  <Text style={styles.statLabel}>Bloquants</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: COLORS.warning }]}>{result.stats.bySeverity.MEDIUM}</Text>
                  <Text style={styles.statLabel}>Importants</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: '#4EA8DE' }]}>{result.stats.bySeverity.LOW}</Text>
                  <Text style={styles.statLabel}>Infos</Text>
                </View>
              </View>

              {/* Seuils utilisés */}
              <View style={styles.thresholdsBar}>
                <Text style={styles.thresholdsText}>
                  🎯 Trous {result.thresholds.gapAfterArrival}h / {result.thresholds.gapBeforeDeparture}h / {result.thresholds.gapBetweenActivities}h · Arrivée limite {result.thresholds.maxArrivalHour}h · Sommeil {result.thresholds.sleepStart}h-{result.thresholds.sleepEnd}h
                </Text>
              </View>

              {/* Issues by severity */}
              {severityOrder.map(sev => {
                const issues = issuesBySeverity[sev];
                if (!issues?.length) return null;
                const cfg = SEVERITY_CONFIG[sev];
                return (
                  <View key={sev} style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <View style={[styles.severityDot, { backgroundColor: cfg.color }]} />
                      <Text style={styles.sectionTitle}>{cfg.label}</Text>
                      <Text style={styles.sectionCount}>{issues.length}</Text>
                    </View>
                    {issues.map(issue => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        onSelectIssue={onSelectIssue}
                      />
                    ))}
                  </View>
                );
              })}

              {/* Rien à signaler */}
              {result.issues.length === 0 && (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyIcon}>✅</Text>
                  <Text style={styles.emptyTitle}>Planning cohérent</Text>
                  <Text style={styles.emptyText}>
                    Aucun chevauchement, trou ou liaison tendue détecté.
                  </Text>
                </View>
              )}

              {/* Footer with summary by type */}
              {result.issues.length > 0 && (
                <View style={styles.typeSummary}>
                  <Text style={styles.typeSummaryTitle}>Par catégorie</Text>
                  {Object.entries(TYPE_LABELS).map(([type, label]) => {
                    const count = result.stats.byType[type] || 0;
                    if (count === 0) return null;
                    return (
                      <View key={type} style={styles.typeRow}>
                        <Text style={styles.typeIcon}>{TYPE_ICONS[type]}</Text>
                        <Text style={styles.typeLabel}>{label}</Text>
                        <Text style={styles.typeCount}>{count}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  closeBtn: {
    padding: 8,
    marginRight: 8,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  refreshBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: SPACING.md,
    paddingBottom: 48,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: COLORS.textMuted,
  },
  errorWrap: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.error,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryBtn: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  retryBtnText: {
    fontSize: 14,
    color: COLORS.accent,
    fontWeight: '600',
  },
  // Stats
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thresholdsBar: {
    backgroundColor: 'rgba(78,168,222,0.1)',
    borderRadius: RADIUS.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: SPACING.md,
  },
  thresholdsText: {
    fontSize: 11,
    color: '#4EA8DE',
    textAlign: 'center',
  },
  // Sections
  section: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  severityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  // Issue card
  issueCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 3,
  },
  issueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: RADIUS.sm,
    marginRight: 8,
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  issueStep: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
    textAlign: 'right',
  },
  issueSummary: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  issueDescription: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  issueMeta: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 6,
  },
  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  // Type summary footer
  typeSummary: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
  },
  typeSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  typeIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 24,
    textAlign: 'center',
  },
  typeLabel: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  typeCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
});
