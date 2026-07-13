#!/usr/bin/env node
/**
 * Test d'envoi SMTP — utilise la config définie dans .env
 * Usage : node scripts/test-smtp.js [email_destinataire]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const to = process.argv[2] || process.env.SMTP_USER;

if (!process.env.SMTP_HOST) {
  console.error('❌ SMTP_HOST non défini dans .env — mode dev (console) actif, pas de vrai envoi.');
  process.exit(1);
}

console.log('📧 Configuration SMTP :');
console.log(`   Host : ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
console.log(`   User : ${process.env.SMTP_USER}`);
console.log(`   Pass : ${process.env.SMTP_PASS ? process.env.SMTP_PASS.slice(0, 4) + '************' : '(vide)'}`);
console.log(`   From : ${process.env.SMTP_FROM}`);
console.log(`   To   : ${to}`);
console.log('');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

(async () => {
  try {
    console.log('🔌 Vérification de la connexion SMTP...');
    await transporter.verify();
    console.log('✅ Connexion SMTP OK\n');

    console.log(`📤 Envoi d'un email de test à ${to}...`);
    const info = await transporter.sendMail({
      from: `"Mon Petit Roadtrip" <${process.env.SMTP_FROM}>`,
      to,
      subject: '✅ Test SMTP — Mon Petit Roadtrip',
      text: 'Si vous recevez cet email, la configuration SMTP fonctionne correctement.',
      html: `<div style="font-family: Arial, sans-serif; padding: 32px;">
        <h2 style="color: #c97d4e;">Mon Petit Roadtrip</h2>
        <p>✅ La configuration SMTP fonctionne correctement.</p>
        <p style="color: #888; font-size: 13px;">Envoyé le ${new Date().toLocaleString('fr-FR')}</p>
      </div>`,
    });

    console.log('✅ Email envoyé avec succès !');
    console.log(`   Message ID : ${info.messageId}`);
  } catch (err) {
    console.error('❌ Échec :', err.message);
    if (err.code === 'EAUTH') {
      console.error('\n💡 Cause probable : identifiants SMTP incorrects (SMTP_USER / SMTP_PASS).');
      console.error('   Pour Gmail : vérifiez que le compte est actif et que SMTP_PASS est un App Password valide.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\n💡 Cause probable : SMTP_HOST ou SMTP_PORT incorrect, ou port bloqué par un firewall.');
    }
    process.exit(1);
  }
})();
