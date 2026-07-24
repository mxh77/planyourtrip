import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING } from '../theme';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import client from '../api/client';

const STATUS_LABELS = {
  pending: 'En attente',
  generating: 'Génération en cours…',
  ready: 'Prêt',
  error: 'Erreur',
};

const STATUS_COLORS = {
  pending: '#f59e0b',
  generating: '#3b82f6',
  ready: '#22c55e',
  error: '#ef4444',
};

const STATUS_ICONS = {
  pending: '⏳',
  generating: '🔄',
  ready: '✅',
  error: '❌',
};

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RoadbookScreen({ route, navigation }) {
  const { roadtripId, roadtripTitle } = route.params;
  const [roadbooks, setRoadbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef(null);

  // ── Charger la liste ──────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    try {
      const res = await client.get(`/api/roadtrips/${roadtripId}/roadbook/list`);
      setRoadbooks(res.data);
      return res.data;
    } catch (err) {
      console.error('[Roadbook] Fetch list error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [roadtripId]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // ── Polling tant qu'il y a des pending/generating ─────────────────────────
  useEffect(() => {
    const hasPending = roadbooks.some(rb => rb.status === 'pending' || rb.status === 'generating');

    if (hasPending) {
      pollRef.current = setInterval(() => {
        fetchList();
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [roadbooks, fetchList]);

  // ── Générer un roadbook ───────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await client.post(`/api/roadtrips/${roadtripId}/roadbook/generate`);
      // Ajouter immédiatement à la liste
      setRoadbooks(prev => [{ id: res.data.id, status: 'pending', createdAt: new Date().toISOString() }, ...prev]);
    } catch (err) {
      Alert.alert('Erreur', `Impossible de lancer la génération : ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Télécharger un roadbook ───────────────────────────────────────────────
  const handleDownload = async (rb) => {
    try {
      const resp = await client.get(`/api/roadtrips/${roadtripId}/roadbook/download/${rb.id}`, {
        responseType: 'arraybuffer',
      });

      const bytes = new Uint8Array(resp.data);
      const filename = `roadbook-${(roadtripTitle || 'roadtrip').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50)}.pdf`;
      const file = new File(Paths.cache, filename);
      file.write(bytes);

      // Utiliser expo-sharing pour ouvrir le PDF
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert('Roadbook téléchargé ✓', 'Le fichier est sauvegardé');
      }
    } catch (err) {
      Alert.alert('Erreur', `Impossible de télécharger : ${err.message}`);
    }
  };

  // ── Supprimer un roadbook ────────────────────────────────────────────────
  const handleDelete = useCallback((rb) => {
    Alert.alert(
      'Supprimer le roadbook',
      `Veux-tu supprimer le roadbook du ${formatDate(rb.createdAt)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await client.delete(`/api/roadtrips/${roadtripId}/roadbook/${rb.id}`);
              setRoadbooks(prev => prev.filter(r => r.id !== rb.id));
            } catch (err) {
              Alert.alert('Erreur', `Impossible de supprimer : ${err.message}`);
            }
          },
        },
      ]
    );
  }, [roadtripId]);

  // ── Header ────────────────────────────────────────────────────────────────
  useEffect(() => {
    navigation.setOptions({
      title: 'Roadbook',
    });
  }, [navigation]);

  // ── Render item ───────────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const isPending = item.status === 'pending' || item.status === 'generating';

    return (
      <TouchableOpacity
        style={[styles.card, item.status === 'error' && styles.cardError]}
        onPress={() => item.status === 'ready' && handleDownload(item)}
        onLongPress={() => handleDelete(item)}
        disabled={item.status !== 'ready' && item.status !== 'error'}
        activeOpacity={0.7}
      >
        <View style={styles.cardLeft}>
          <Text style={styles.cardIcon}>{STATUS_ICONS[item.status] || '📄'}</Text>
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardStatus, { color: STATUS_COLORS[item.status] }]}>
              {STATUS_LABELS[item.status] || item.status}
            </Text>
            {item.fileSize && (
              <Text style={styles.cardSize}>{formatSize(item.fileSize)}</Text>
            )}
          </View>
          <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
          {item.status === 'error' && item.error && (
            <Text style={styles.cardErrorText}>{item.error}</Text>
          )}
          {isPending && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, {
                width: item.status === 'generating' ? '60%' : '30%',
                backgroundColor: STATUS_COLORS[item.status],
              }]} />
            </View>
          )}
        </View>
        {item.status === 'ready' && (
          <View style={styles.cardRight}>
            <Text style={styles.downloadIcon}>⬇️</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Bouton générer */}
      <TouchableOpacity
        style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
        onPress={handleGenerate}
        disabled={generating}
        activeOpacity={0.7}
      >
        {generating ? (
          <>
            <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
            <Text style={styles.generateBtnText}>Lancement...</Text>
          </>
        ) : (
          <>
            <Text style={styles.generateBtnIcon}>📖</Text>
            <Text style={styles.generateBtnText}>Générer un roadbook</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Bouton prévisualiser */}
      <TouchableOpacity
        style={styles.previewBtn}
        onPress={() => navigation.navigate('RoadbookPreview', { roadtripId, roadtripTitle })}
        activeOpacity={0.7}
      >
        <Text style={styles.previewBtnIcon}>👁️</Text>
        <Text style={styles.previewBtnText}>Prévisualiser dans l'app</Text>
      </TouchableOpacity>

      {/* Liste */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.accent} />
        </View>
      ) : roadbooks.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📄</Text>
          <Text style={styles.emptyText}>Aucun roadbook généré</Text>
          <Text style={styles.emptySubtext}>
            Clique sur le bouton ci-dessus pour générer le PDF complet de ton roadtrip
          </Text>
        </View>
      ) : (
        <FlatList
          data={roadbooks}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#718096',
    textAlign: 'center',
    lineHeight: 20,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  generateBtnDisabled: {
    opacity: 0.6,
  },
  generateBtnIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  generateBtnText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: '700',
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceElevated,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  previewBtnIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  previewBtnText: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e2e',
    borderRadius: RADIUS.md,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d2d44',
  },
  cardError: {
    borderColor: '#ef444444',
  },
  cardLeft: {
    marginRight: 14,
  },
  cardIcon: {
    fontSize: 28,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardStatus: {
    fontSize: 15,
    fontWeight: '600',
  },
  cardSize: {
    fontSize: 12,
    color: '#718096',
  },
  cardDate: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  cardErrorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  cardRight: {
    marginLeft: 8,
  },
  downloadIcon: {
    fontSize: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#2d2d44',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
});
