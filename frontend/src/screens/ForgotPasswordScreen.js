import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SPACING } from '../theme';
import { useAuthStore } from '../store/authStore';

export default function ForgotPasswordScreen({ navigation }) {
  // step: 'email' | 'reset'
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const { forgotPassword, resetPassword } = useAuthStore();

  // ── Étape 1 : envoi du code ────────────────────────────────────────────────
  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert('Email requis', 'Veuillez saisir votre adresse email.');
      return;
    }
    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setStep('reset');
    } catch {
      Alert.alert('Erreur', 'Impossible d\'envoyer le code. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  // ── Étape 2 : saisie du code + nouveau mot de passe ───────────────────────
  const handleResetPassword = async () => {
    if (code.trim().length !== 6) {
      Alert.alert('Code invalide', 'Saisissez le code à 6 chiffres reçu par email.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mots de passe différents', 'Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), code.trim(), newPassword);
      Alert.alert(
        'Mot de passe modifié',
        'Votre mot de passe a été mis à jour. Vous pouvez maintenant vous connecter.',
        [{ text: 'Connexion', onPress: () => navigation.navigate('Login') }]
      );
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Code invalide ou expiré.');
    } finally {
      setLoading(false);
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

        <View style={styles.iconContainer}>
          <Text style={styles.icon}>{step === 'email' ? '🔑' : '🔒'}</Text>
        </View>

        {step === 'email' ? (
          <>
            <Text style={styles.title}>Mot de passe oublié ?</Text>
            <Text style={styles.subtitle}>
              Saisissez votre adresse email. Nous vous enverrons un code pour réinitialiser votre mot de passe.
            </Text>
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="votre@email.com"
                  placeholderTextColor={COLORS.textDim}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.bg} />
                ) : (
                  <Text style={styles.submitBtnText}>Envoyer le code</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title}>Nouveau mot de passe</Text>
            <Text style={styles.subtitle}>
              Code envoyé à{' '}
              <Text style={styles.emailHighlight}>{email}</Text>
              {'\n'}Saisissez le code et votre nouveau mot de passe.
            </Text>
            <View style={styles.form}>
              {/* Code OTP */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Code reçu par email</Text>
                <TextInput
                  style={styles.otpInput}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor={COLORS.textDim}
                  keyboardType="number-pad"
                  maxLength={6}
                  textAlign="center"
                  autoFocus
                />
              </View>

              {/* Nouveau mot de passe */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nouveau mot de passe</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="8 caractères minimum"
                    placeholderTextColor={COLORS.textDim}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword(v => !v)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirmation */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirmer le mot de passe</Text>
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor={COLORS.textDim}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.bg} />
                ) : (
                  <Text style={styles.submitBtnText}>Réinitialiser le mot de passe</Text>
                )}
              </TouchableOpacity>

              {/* Renvoyer le code */}
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => { setStep('email'); setCode(''); }}
              >
                <Text style={styles.resendBtnText}>Renvoyer un nouveau code</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Retour connexion */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.backBtnText}>← Retour à la connexion</Text>
        </TouchableOpacity>
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
  input: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
  },
  passwordInput: {
    flex: 1,
    padding: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
  },
  eyeBtn: {
    paddingHorizontal: SPACING.md,
  },
  eyeIcon: {
    fontSize: 18,
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
  resendBtn: {
    alignItems: 'center',
    padding: SPACING.sm,
  },
  resendBtnText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  backBtn: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    padding: SPACING.sm,
  },
  backBtnText: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
});
