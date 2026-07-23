import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { COLORS } from '../theme';

const TYPE_ICONS = {
  OVERLAP: '⚡',
  GAP: '⏳',
  TIGHT: '⏱️',
  LATE_ARRIVAL: '🌙',
  LATE_CHECKIN: '🔑',
  EMPTY_DAY: '📭',
  TRAVEL_MISMATCH: '🔄',
};

export default function CoherenceAlertModal({ issues, onClose, onFix, onApplySuggestion }) {
  if (!issues || issues.length === 0) return null;

  const displayIssues = issues.filter(i => i.severity === 'HIGH');
  // Si aucun HIGH, montrer quand même le premier problème
  const main = displayIssues[0] || issues[0];
  const shownIssues = displayIssues.length > 0 ? displayIssues : issues;

  // Suggestions : pour TIGHT (trajet serré) ou pour minuit (arrivée non définie)
  const suggestions = React.useMemo(() => {
    if (!main) return [];
    // Trajet trop serré → calcul basé sur le départ + route
    if (main?.type === 'TIGHT' && main?.departureTime && main?.routeMinutes) {
      const [dh, dm] = main.departureTime.split(':').map(Number);
      if (isNaN(dh)) return [];
      const depMin = dh * 60 + (dm || 0);
      const minArrivalMin = depMin + main.routeMinutes;
      const roundUp30 = Math.ceil(minArrivalMin / 30) * 30;
      return [0, 1, 2].map(offset => {
        const totalMin = roundUp30 + offset * 30;
        const nh = Math.floor(totalMin / 60);
        const nm = totalMin % 60;
        return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      });
    }
    // Arrivée à minuit → calculer depuis le départ + trajet de l'étape précédente
    if (main?.type === 'GAP' && /minuit/i.test(main?.summary || '') && main?.departureTime) {
      const [dh, dm] = main.departureTime.split(':').map(Number);
      if (isNaN(dh)) return ['14:00', '14:30', '15:00'];
      const depMin = dh * 60 + (dm || 0);
      const baseMin = depMin + (main.routeMinutes || 0) + 30; // +30 min de marge mini
      const roundUp30 = Math.ceil(baseMin / 30) * 30;
      return [0, 1, 2].map(offset => {
        const totalMin = roundUp30 + offset * 30;
        const nh = Math.floor(totalMin / 60);
        const nm = totalMin % 60;
        return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
      });
    }
    return [];
  }, [main]);

  return (
    <Modal transparent animationType="slide" visible={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          {/* Header icon */}
          <View style={styles.iconWrap}>
            <Text style={styles.iconText}>⚠️</Text>
          </View>

          <Text style={styles.title}>Incohérence détectée</Text>
          <Text style={styles.subtitle}>
            {shownIssues.length > 1
              ? `${shownIssues.length} problèmes nécessitent votre attention`
              : 'Un problème nécessite votre attention'}
          </Text>

          {/* Carte du problème principal */}
          <View style={styles.issueCard}>
            <View style={styles.issueCardTop}>
              <Text style={styles.issueTypePill}>
                {TYPE_ICONS[main?.type] || '⚠️'}  {main?.severity}
              </Text>
            </View>
            <Text style={styles.issueSummary}>{main?.summary}</Text>
            {main?.description?.split('\n').map((line, i) => (
              <Text
                key={i}
                style={[
                  styles.issueDesc,
                  /arrivée/i.test(line) && styles.issueDescArrival,
                ]}
              >
                {line}
              </Text>
            ))}
          </View>

          {suggestions.length > 0 && (
            <View style={styles.suggestionsRow}>
              <Text style={styles.suggestionsLabel}>Ajuster l'arrivée à :</Text>
              <View style={styles.suggestionsBtns}>
                {suggestions.map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionBtn}
                    onPress={() => onApplySuggestion?.(t, main)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.suggestionBtnText}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {shownIssues.length > 1 && (
            <View style={styles.otherList}>
              <Text style={styles.otherListTitle}>Autre{shownIssues.length > 2 ? 's' : ''} problème{shownIssues.length > 2 ? 's' : ''} détecté{shownIssues.length > 2 ? 's' : ''} :</Text>
              {shownIssues.slice(1).map((iss, idx) => (
                <View key={idx} style={styles.otherCard}>
                  <View style={styles.otherCardTop}>
                    <Text style={styles.otherTypePill}>
                      {TYPE_ICONS[iss.type] || '⚠️'}  {iss.severity}
                    </Text>
                  </View>
                  <Text style={styles.otherSummary}>{iss.summary}</Text>
                  <Text style={styles.otherDesc}>{iss.description}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.ignoreBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.ignoreBtnText}>Ignorer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.fixBtn} onPress={onFix || onClose} activeOpacity={0.8}>
              <Text style={styles.fixBtnText}>Corriger</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 28,
    paddingBottom: 40,
    paddingTop: 8,
    alignItems: 'center',
  },
  handleRow: { alignItems: 'center', marginBottom: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },

  /* Header */
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.warningDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconText: { fontSize: 28 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24, textAlign: 'center' },

  /* Issue card */
  issueCard: {
    backgroundColor: 'rgba(232,164,53,0.06)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(232,164,53,0.15)',
    marginBottom: 12,
  },
  issueCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  issueTypePill: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
    backgroundColor: COLORS.accentDim,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  issueSummary: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  issueDesc: {
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
  },
  issueDescArrival: {
    color: '#E85435',
    fontWeight: '600',
  },

  /* Suggestions */
  suggestionsRow: {
    width: '100%',
    marginBottom: 16,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  suggestionsBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  suggestionBtn: {
    flex: 1,
    backgroundColor: COLORS.accentDim,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232,164,53,0.25)',
  },
  suggestionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },

  /* Autres problèmes (liste) */
  otherList: {
    width: '100%',
    marginBottom: 16,
  },
  otherListTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  otherCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  otherCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  otherTypePill: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
  otherSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
  },
  otherDesc: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },

  /* More badge (fallback) */
  moreBadge: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  moreBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
  },

  /* Buttons */
  actionsRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 4 },
  ignoreBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  ignoreBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted },
  fixBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    // Ombre subtile
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fixBtnText: { fontSize: 15, fontWeight: '700', color: '#090909' },
});
