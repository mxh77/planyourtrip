import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';

export default function VerifyEmailScreen({ navigation, route }) {
  const emailParam = route?.params?.email;
  const { pendingVerificationEmail, verifyEmail, resendVerification } = useAuthStore();
  const email = emailParam || pendingVerificationEmail || '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRef = useRef(null);

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Code invalide', 'Saisissez le code à 6 chiffres reçu par email.');
      return;
    }
    setLoading(true);
    try {
      await verifyEmail(email, code.trim());
      // La navigation vers Home se fait automatiquement via AppNavigator (token présent)
    } catch (err) {
      Alert.alert(
        'Code incorrect',
        err.response?.data?.error || 'Code invalide ou expiré.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
      Alert.alert('Code renvoyé', 'Un nouveau code vous a été envoyé par email.');
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer le code. Vérifiez votre connexion.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ─── Header ───────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.logo}>Mon Petit</Text>
          <Text style={styles.logoAccent}>Roadtrip</Text>
        </View>

        {/* ─── Icon ─────────────────────────────────────────────────────── */}
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>✉️</Text>
        </View>

        {/* ─── Title ────────────────────────────────────────────────────── */}
        <Text style={styles.title}>Vérifiez votre email</Text>
        <Text style={styles.subtitle}>
          Un code à 6 chiffres a été envoyé à{'\n'}
          <Text style={styles.emailHighlight}>{email}</Text>
        </Text>

        {/* ─── OTP Input ────────────────────────────────────────────────── */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Code de vérification</Text>
            <TextInput
              ref={inputRef}
              style={styles.otpInput}
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={COLORS.textDim}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              textAlign="center"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, (loading || code.length !== 6) && styles.submitBtnDisabled]}
            onPress={handleVerify}
            disabled={loading || code.length !== 6}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={styles.submitBtnText}>Confirmer le compte</Text>
            )}
          </TouchableOpacity>

          {/* Renvoyer le code */}
          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Vous n'avez pas reçu de code ?</Text>
            <TouchableOpacity onPress={handleResend} disabled={resending}>
              {resending ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <Text style={styles.resendLink}>Renvoyer</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Retour connexion */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation?.navigate('Login')}
          >
            <Text style={styles.backBtnText}>← Retour à la connexion</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logo: {
    fontFamily: FONTS.titleRegular,
    fontSize: 28,
    color: COLORS.text,
    letterSpacing: 1,
  },
  logoAccent: {
    fontFamily: FONTS.titleItalic,
    fontSize: 38,
    color: COLORS.accent,
    marginTop: -6,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontFamily: FONTS.title,
    fontSize: 26,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emailHighlight: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  form: {
    gap: SPACING.md,
  },
  inputGroup: {
    gap: SPACING.xs,
  },
  label: {
    color: COLORS.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  otpInput: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 28,
    letterSpacing: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  submitBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: COLORS.bg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  resendText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  resendLink: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    marginTop: SPACING.sm,
    padding: SPACING.sm,
  },
  backBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});
