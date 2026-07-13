import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import client from '../api/client';

const CATEGORIES = [
  { key: 'bug',       label: '🐛 Bug',       desc: 'Quelque chose ne fonctionne pas' },
  { key: 'evolution', label: '💡 Évolution',  desc: 'Une idée d'amélioration' },
  { key: 'question',  label: '❓ Question',   desc: 'Besoin d'aide ou de clarification' },
  { key: 'other',     label: '… Autre',       desc: 'Autre chose' },
];

const MAX_CHARS = 2000;
const MAX_FILES = 5;

export default function SuggestionModal({ visible, onClose }) {
  const [content, setContent]     = useState('');
  const [category, setCategory]   = useState('evolution');
  const [files, setFiles]         = useState([]); // [{ uri, mimeType, filename }]
  const [isSending, setIsSending] = useState(false);

  const handlePickPhoto = useCallback(async () => {
    if (files.length >= MAX_FILES) {
      Alert.alert('Maximum atteint', `Vous pouvez joindre jusqu'à ${MAX_FILES} fichiers.`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'L\'accès à la galerie est requis pour joindre une photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const ext = (asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg';
      setFiles(prev => [...prev, {
        uri: asset.uri,
        mimeType: asset.mimeType || 'image/jpeg',
        filename: `photo_${Date.now()}.${ext}`,
      }]);
    }
  }, [files]);

  const removeFile = useCallback((idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSend = useCallback(async () => {
    if (!content.trim()) {
      Alert.alert('Contenu vide', 'Veuillez décrire votre suggestion avant d\'envoyer.');
      return;
    }

    setIsSending(true);
    try {
      const form = new FormData();
      form.append('content', content.trim());
      form.append('category', category);
      files.forEach(f => {
        form.append('files', { uri: f.uri, name: f.filename, type: f.mimeType });
      });

      await client.post('/api/suggestions', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      Alert.alert('Merci ! 🙏', 'Votre suggestion a bien été envoyée.');
      setContent('');
      setFiles([]);
      setCategory('evolution');
      onClose();
    } catch (err) {
      Alert.alert('Erreur', err?.response?.data?.error || 'Impossible d\'envoyer la suggestion. Réessayez plus tard.');
    } finally {
      setIsSending(false);
    }
  }, [content, category, files, onClose]);

  function handleClose() {
    setContent('');
    setFiles([]);
    setCategory('evolution');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Faire une suggestion</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Catégorie */}
            <Text style={styles.sectionLabel}>Catégorie</Text>
            <View style={styles.categories}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.catChip, category === cat.key && styles.catChipActive]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Text style={[styles.catLabel, category === cat.key && styles.catLabelActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description de la catégorie sélectionnée */}
            <Text style={styles.catDesc}>
              {CATEGORIES.find(c => c.key === category)?.desc}
            </Text>

            {/* Contenu */}
            <Text style={styles.sectionLabel}>Description</Text>
            <TextInput
              style={styles.textarea}
              value={content}
              onChangeText={text => setContent(text.slice(0, MAX_CHARS))}
              placeholder="Décrivez votre suggestion, bug ou question…"
              placeholderTextColor={COLORS.textDim}
              multiline
              textAlignVertical="top"
              maxLength={MAX_CHARS}
            />
            <Text style={styles.charCount}>{content.length} / {MAX_CHARS}</Text>

            {/* Photos */}
            <View style={styles.filesRow}>
              <Text style={styles.sectionLabel}>Photos ({files.length}/{MAX_FILES})</Text>
              {files.length < MAX_FILES && (
                <TouchableOpacity onPress={handlePickPhoto} style={styles.addPhotoBtn}>
                  <Text style={styles.addPhotoBtnText}>+ Ajouter</Text>
                </TouchableOpacity>
              )}
            </View>
            {files.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                {files.map((f, i) => (
                  <View key={i} style={styles.photoThumb}>
                    <Image source={{ uri: f.uri }} style={styles.photoImg} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => removeFile(i)}>
                      <Text style={styles.photoRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Bouton Envoyer */}
            <TouchableOpacity
              style={[styles.sendBtn, isSending && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={isSending}
            >
              {isSending
                ? <ActivityIndicator color={COLORS.bg} size="small" />
                : <Text style={styles.sendBtnText}>Envoyer la suggestion</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl + 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: FONTS.title,
    fontSize: 22,
    color: COLORS.text,
  },
  closeBtn: {
    color: COLORS.textMuted,
    fontSize: 16,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },

  categories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  catChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(232,164,53,0.15)',
  },
  catLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  catLabelActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  catDesc: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 4,
    fontStyle: 'italic',
  },

  textarea: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    color: COLORS.text,
    fontSize: 14,
    padding: SPACING.md,
    minHeight: 120,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textDim,
    textAlign: 'right',
    marginTop: 4,
  },

  filesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addPhotoBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  addPhotoBtnText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '600',
  },
  photosScroll: {
    marginBottom: SPACING.sm,
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    marginRight: SPACING.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },

  sendBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    color: COLORS.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});
