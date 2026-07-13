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

const FEEDBACK_TYPES = [
  { key: 'BUG',        label: '🐛 Bug',        desc: 'Quelque chose ne fonctionne pas' },
  { key: 'SUGGESTION', label: '💡 Suggestion', desc: 'Une idée d’amélioration' },
  { key: 'QUESTION',   label: '❓ Question',   desc: 'Besoin d’aide' },
  { key: 'AUTRE',      label: '… Autre',       desc: 'Autre chose' },
];

export default function BetaFeedbackModal({ visible, onClose }) {
  const [text, setText] = useState('');
  const [type, setType] = useState('SUGGESTION');
  const [photos, setPhotos] = useState([]); // [{ uri, mimeType }]
  const [isSending, setIsSending] = useState(false);

  const handlePickPhoto = useCallback(async () => {
    if (photos.length >= 3) {
      Alert.alert('Maximum atteint', 'Vous pouvez joindre jusqu\'à 3 photos.');
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
      setPhotos(prev => [...prev, { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' }]);
    }
  }, [photos]);

  const removePhoto = useCallback((idx) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSend = useCallback(async () => {
    if (!text.trim()) {
      Alert.alert('Feedback vide', 'Veuillez saisir votre suggestion avant d\'envoyer.');
      return;
    }

    setIsSending(true);
    try {
      const form = new FormData();
      form.append('text', text.trim());
      form.append('type', type);
      photos.forEach((p, i) => {
        const filename = `photo_${i}.${p.mimeType.split('/')[1] || 'jpg'}`;
        form.append('photos', { uri: p.uri, name: filename, type: p.mimeType });
      });

      await client.post('/api/beta/feedback', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('Merci ! 🙏', 'Votre feedback a bien été envoyé.');
      setText('');
      setPhotos([]);
      setType('SUGGESTION');
      onClose();
    } catch (e) {
      Alert.alert('Erreur', 'Impossible d\'envoyer le feedback. Veuillez réessayer.');
    } finally {
      setIsSending(false);
    }
  }, [text, photos, onClose]);

  const handleClose = useCallback(() => {
    setText('');
    setPhotos([]);
    setType('SUGGESTION');
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Feedback Beta 🛠️</Text>
          <Text style={styles.subtitle}>
            Une idée, un bug, une suggestion ? Dites-nous tout !
          </Text>

          {/* Sélecteur de type */}
          <View style={styles.typeRow}>
            {FEEDBACK_TYPES.map(ft => (
              <TouchableOpacity
                key={ft.key}
                style={[styles.typeChip, type === ft.key && styles.typeChipActive]}
                onPress={() => setType(ft.key)}
                disabled={isSending}
              >
                <Text style={[styles.typeChipText, type === ft.key && styles.typeChipTextActive]}>
                  {ft.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Votre suggestion..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              value={text}
              onChangeText={setText}
              editable={!isSending}
            />
          </View>

          {/* Vignettes photos */}
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosRow}>
              {photos.map((p, idx) => (
                <View key={idx} style={styles.thumbWrap}>
                  <Image source={{ uri: p.uri }} style={styles.thumb} resizeMode="cover" />
                  <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(idx)}>
                    <Text style={styles.thumbRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            {/* Bouton photo */}
            <TouchableOpacity
              style={[styles.iconBtn, photos.length >= 3 && styles.iconBtnDisabled]}
              onPress={handlePickPhoto}
              disabled={photos.length >= 3 || isSending}
            >
              <Text style={styles.iconBtnText}>📷</Text>
              {photos.length > 0 && (
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>{photos.length}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.clearBtn, !text.trim() && styles.clearBtnDisabled]}
              onPress={() => setText('')}
              disabled={!text.trim() || isSending}
            >
              <Text style={styles.clearIcon}>🗑️</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || isSending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator color={COLORS.bg} size="small" />
              ) : (
                <Text style={styles.sendBtnText}>Envoyer</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={isSending}>
            <Text style={styles.cancelBtnText}>Annuler</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    paddingBottom: SPACING.xl,
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
  title: {
    fontFamily: FONTS.title,
    fontSize: 24,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  typeChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceElevated,
  },
  typeChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '20',
  },
  typeChipText: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: COLORS.accent,
    fontWeight: '700',
  },
  inputRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
    marginBottom: SPACING.sm,
  },
  input: {
    color: COLORS.text,
    fontSize: 15,
    padding: SPACING.md,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  photosRow: {
    marginBottom: SPACING.sm,
  },
  thumbWrap: {
    marginRight: SPACING.sm,
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceElevated,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnDisabled: { opacity: 0.3 },
  iconBtnText: { fontSize: 20 },
  photoBadge: {
    position: 'absolute',
    top: -4, right: -4,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  clearBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearBtnDisabled: {
    opacity: 0.3,
  },
  clearIcon: { fontSize: 20 },
  sendBtn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.accentDim,
  },
  sendBtnText: {
    color: COLORS.bg,
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  cancelBtnText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
});
