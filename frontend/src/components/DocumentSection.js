import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Linking, Modal, Pressable,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery } from '@powersync/react-native';
import { COLORS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';
import { localInsertDocument, localDeleteDocument, generateId } from '../powersync/localWrite';

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', txt: '📃',
  xls: '📊', xlsx: '📊', csv: '📋',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', webp: '🖼️',
  default: '📎',
};

function getFileIcon(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function DocumentSection({ accommodationId, activityId, roadtripId }) {
  const userId = useAuthStore((s) => s.user?.id);

  // Charger les documents depuis PowerSync
  const { data: documents = [] } = useQuery(
    accommodationId
      ? 'SELECT * FROM documents WHERE accommodationId = ? ORDER BY createdAt ASC'
      : 'SELECT * FROM documents WHERE activityId = ? ORDER BY createdAt ASC',
    [accommodationId || activityId]
  );

  const [uploading, setUploading] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuDoc, setMenuDoc] = useState(null);

  const handleAddDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf', 'image/*',
          'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain', 'text/csv',
          'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      setUploading(true);

      await localInsertDocument({
        id: generateId(),
        url: asset.uri,
        name: asset.name,
        accommodationId: accommodationId || null,
        activityId: activityId || null,
        roadtripId: roadtripId || null,
        userId,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('[DocumentSection] pick error:', e.message);
      Alert.alert('Erreur', "Impossible de sélectionner le fichier.");
    } finally {
      setUploading(false);
    }
  };

  const openDocumentMenu = (doc) => {
    setMenuDoc(doc);
    setMenuVisible(true);
  };

  const handleOpenDocument = () => {
    setMenuVisible(false);
    const doc = menuDoc;
    if (doc?.url) {
      Linking.openURL(doc.url).catch(() => {
        Alert.alert('Erreur', 'Impossible d\'ouvrir ce document.');
      });
    }
  };

  const handleDeleteDocument = () => {
    setMenuVisible(false);
    const doc = menuDoc;
    Alert.alert('Supprimer ce document ?', `« ${doc.name || doc.originalName || 'Document'} » sera supprimé.`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => localDeleteDocument(doc.id) },
    ]);
  };

  if (documents.length === 0 && !uploading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Documents</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleAddDocument}>
          <Text style={styles.addBtnText}>+ Ajouter un document</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Documents ({documents.length})
      </Text>

      {documents.map((doc) => (
        <TouchableOpacity
          key={doc.id}
          style={styles.docRow}
          onPress={() => {
            if (doc.url) Linking.openURL(doc.url).catch(() => {});
          }}
          onLongPress={() => openDocumentMenu(doc)}
        >
          <Text style={styles.docIcon}>{getFileIcon(doc.name || doc.originalName)}</Text>
          <View style={styles.docInfo}>
            <Text style={styles.docName} numberOfLines={1}>
              {doc.name || doc.originalName || 'Document'}
            </Text>
            {doc.fileSize ? (
              <Text style={styles.docSize}>{formatFileSize(doc.fileSize)}</Text>
            ) : doc.isPending ? (
              <Text style={styles.docPending}>En attente de synchronisation…</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={handleAddDocument} disabled={uploading}>
        {uploading ? (
          <ActivityIndicator color={COLORS.accent} size="small" />
        ) : (
          <Text style={styles.addBtnText}>+ Ajouter un document</Text>
        )}
      </TouchableOpacity>

      {/* ─── Menu contextuel document ──────────────────────────────────── */}
      <Modal visible={menuVisible} transparent animationType="slide" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{menuDoc?.name || menuDoc?.originalName || 'Document'}</Text>
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenDocument}>
              <Text style={styles.menuIcon}>👁</Text>
              <Text style={styles.menuLabel}>Ouvrir le document</Text>
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem} onPress={handleDeleteDocument}>
              <Text style={styles.menuIcon}>🗑</Text>
              <Text style={styles.menuLabelDanger}>Supprimer</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: RADIUS.md,
    marginBottom: 6,
  },
  docIcon: {
    fontSize: 22,
    width: 32,
    textAlign: 'center',
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  docSize: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 1,
  },
  docPending: {
    color: COLORS.accent,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 1,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    marginTop: 4,
  },
  addBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
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
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { fontSize: 15, color: COLORS.text, fontWeight: '600' },
  menuLabelDanger: { fontSize: 15, color: COLORS.error, fontWeight: '600' },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
});