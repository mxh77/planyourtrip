const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    // Mode dev : logs console uniquement (pas de config SMTP)
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

const FROM = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@monpetit-roadtrip.app';
const APP_NAME = 'Mon Petit Roadtrip';

/**
 * Envoie un email de vérification avec un code OTP à 6 chiffres.
 */
async function sendVerificationEmail(email, name, otp) {
  const displayName = name || email;
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Vérification de votre adresse email</title></head>
<body style="font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <h2 style="font-size: 22px; color: #1a1a1a; margin-bottom: 8px;">${APP_NAME}</h2>
    <p style="color: #555; margin-bottom: 28px;">Bonjour ${displayName},</p>
    <p style="color: #333;">Voici votre code de vérification pour confirmer votre adresse email :</p>
    <div style="text-align: center; margin: 32px 0;">
      <span style="font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #c97d4e; background: #fdf5f0; padding: 16px 28px; border-radius: 10px; display: inline-block;">${otp}</span>
    </div>
    <p style="color: #777; font-size: 13px;">Ce code est valable pendant <strong>30 minutes</strong>.</p>
    <p style="color: #777; font-size: 13px;">Si vous n'avez pas créé de compte, ignorez cet email.</p>
  </div>
</body>
</html>`;

  const text = `Bonjour ${displayName},\n\nVotre code de vérification est : ${otp}\n\nCe code est valable 30 minutes.`;

  await sendMail({ to: email, subject: `${otp} — Vérification de votre email`, html, text });
}

/**
 * Envoie un email de réinitialisation de mot de passe.
 */
async function sendPasswordResetEmail(email, name, otp) {
  const displayName = name || email;
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Réinitialisation de mot de passe</title></head>
<body style="font-family: Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <h2 style="font-size: 22px; color: #1a1a1a; margin-bottom: 8px;">${APP_NAME}</h2>
    <p style="color: #555; margin-bottom: 28px;">Bonjour ${displayName},</p>
    <p style="color: #333;">Voici votre code pour réinitialiser votre mot de passe :</p>
    <div style="text-align: center; margin: 32px 0;">
      <span style="font-size: 40px; font-weight: bold; letter-spacing: 10px; color: #c97d4e; background: #fdf5f0; padding: 16px 28px; border-radius: 10px; display: inline-block;">${otp}</span>
    </div>
    <p style="color: #777; font-size: 13px;">Ce code est valable pendant <strong>15 minutes</strong>.</p>
    <p style="color: #777; font-size: 13px;">Si vous n'avez pas demandé de réinitialisation, ignorez cet email.</p>
  </div>
</body>
</html>`;

  const text = `Bonjour ${displayName},\n\nVotre code de réinitialisation est : ${otp}\n\nCe code est valable 15 minutes.`;

  await sendMail({ to: email, subject: `${otp} — Réinitialisation de mot de passe`, html, text });
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransporter();
  if (!t) {
    // Dev sans SMTP : afficher dans la console
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  [MAILER - DEV] À : ${to}`);
    console.log(`║  Sujet : ${subject}`);
    console.log(`║  Contenu : ${text}`);
    console.log('╚══════════════════════════════════════════════════╝\n');
    return;
  }

  try {
    await t.sendMail({ from: `"${APP_NAME}" <${FROM}>`, to, subject, html, text });
  } catch (err) {
    // Ne pas crasher le serveur sur une erreur SMTP — logger et fallback console
    console.error('[MAILER] Échec envoi email SMTP :', err.message);
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  [MAILER - FALLBACK] À : ${to}`);
    console.log(`║  Sujet : ${subject}`);
    console.log(`║  Contenu : ${text}`);
    console.log('╚══════════════════════════════════════════════════╝\n');
    // Réinitialiser le transporter pour la prochaine tentative
    transporter = null;
  }
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
