const router = require('express').Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/mailer');

const ACCESS_TOKEN_TTL  = '1h';
const REFRESH_TOKEN_DAYS = 90;

/** Génère un OTP numérique à 6 chiffres */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Hash un OTP avec SHA-256 (pour stockage sécurisé) */
function hashOtp(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function generateAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, isAdmin: user.isAdmin ?? false }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

async function generateRefreshToken(userId) {
  const token = crypto.randomBytes(64).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);
  await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  return token;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'Email already in use' });
  }

  const hash = await bcrypt.hash(password, 12);

  // Générer OTP de vérification
  const otp = generateOtp();
  const expires = new Date(Date.now() + 30 * 60 * 1000); // 30 min

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      password: hash,
      emailVerificationToken: hashOtp(otp),
      emailVerificationExpires: expires,
    },
  });

  await sendVerificationEmail(email, name || null, otp);

  res.status(201).json({
    message: 'Compte créé. Vérifiez votre email pour activer votre compte.',
    requiresVerification: true,
  });
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'email and code are required' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true, email: true, name: true, avatarUrl: true, isAdmin: true, createdAt: true,
      emailVerifiedAt: true, emailVerificationToken: true, emailVerificationExpires: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (user.emailVerifiedAt) {
    return res.status(400).json({ error: 'Email already verified' });
  }
  if (!user.emailVerificationToken || !user.emailVerificationExpires) {
    return res.status(400).json({ error: 'No pending verification' });
  }
  if (user.emailVerificationExpires < new Date()) {
    return res.status(400).json({ error: 'Verification code expired. Please request a new one.' });
  }
  if (user.emailVerificationToken !== hashOtp(code)) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  // Marquer l'email comme vérifié
  const verifiedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
    select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true, createdAt: true },
  });

  const token = generateAccessToken(verifiedUser);
  const refreshToken = await generateRefreshToken(verifiedUser.id);

  res.json({ user: verifiedUser, token, refreshToken });
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerifiedAt: true },
  });

  // Réponse générique pour éviter l'énumération d'emails
  if (!user || user.emailVerifiedAt) {
    return res.json({ message: 'If this email exists and is unverified, a code has been sent.' });
  }

  const otp = generateOtp();
  const expires = new Date(Date.now() + 30 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationToken: hashOtp(otp), emailVerificationExpires: expires },
  });

  await sendVerificationEmail(email, user.name, otp);

  res.json({ message: 'If this email exists and is unverified, a code has been sent.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email },
    select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true, createdAt: true, password: true, emailVerifiedAt: true },
  });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Bloquer la connexion si email non vérifié
  if (!user.emailVerifiedAt) {
    return res.status(403).json({ error: 'Email not verified', requiresVerification: true });
  }

  const { password: _pw, emailVerifiedAt: _ev, ...safeUser } = user;

  const token = generateAccessToken(safeUser);
  const refreshToken = await generateRefreshToken(user.id);

  res.json({ user: safeUser, token, refreshToken });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, emailVerifiedAt: true },
  });

  // Réponse générique (sécurité anti-énumération)
  if (!user || !user.emailVerifiedAt) {
    return res.json({ message: 'If this email is registered, a reset code has been sent.' });
  }

  // Invalider les anciens tokens non utilisés
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const otp = generateOtp();
  const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await prisma.passwordResetToken.create({
    data: { token: hashOtp(otp), userId: user.id, expiresAt: expires },
  });

  await sendPasswordResetEmail(email, user.name, otp);

  res.json({ message: 'If this email is registered, a reset code has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) {
    return res.status(400).json({ error: 'email, code and newPassword are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, token: hashOtp(code), usedAt: null },
  });

  if (!resetToken) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }
  if (resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'Reset code expired. Please request a new one.' });
  }

  const hash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    // Révoquer tous les refresh tokens pour déconnecter les autres appareils
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  res.json({ message: 'Password updated successfully' });
});

// POST /api/auth/refresh — renouvelle l'access token via le refresh token (rotation)
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  // Rotation : révoquer l'ancien, émettre un nouveau
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const user = await prisma.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, name: true, avatarUrl: true, isAdmin: true, createdAt: true },
  });
  if (!user) return res.status(401).json({ error: 'User not found' });

  const newToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id);

  res.json({ token: newToken, refreshToken: newRefreshToken });
});

// POST /api/auth/logout — révoque le refresh token
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    }).catch(() => {});
  }
  res.status(204).send();
});

// GET /api/auth/powersync-token — génère un token JWT compatible PowerSync (Custom HS256)
router.get('/powersync-token', auth, async (req, res) => {
  try {
    // Utilise le secret PowerSync partagé (Custom HS256 dans PowerSync Cloud)
    const psSecret = Buffer.from(process.env.POWERSYNC_JWT_SECRET, 'base64url');
    const payload = {
      sub: req.user.userId,
      user_id: req.user.userId,  // claim custom pour PowerSync
      iat: Math.floor(Date.now() / 1000),
    };
    
    const psToken = jwt.sign(
      payload,
      psSecret,
      {
        expiresIn: '1h',
        audience: process.env.POWERSYNC_URL,
        keyid: process.env.POWERSYNC_JWT_KID,
      }
    );

    console.log('[PowerSync Token] Generated for userId:', req.user.userId);

    res.json({ 
      token: psToken, 
      powersyncUrl: process.env.POWERSYNC_URL,
      userId: req.user.userId,
    });
  } catch (err) {
    console.error('[PowerSync Token Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/push-token — enregistrer le token Expo Push de l'appareil
router.post('/push-token', auth, async (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token is required' });
  }
  // Valider format Expo token (ExponentPushToken[...] ou ea... pour bare)
  if (!token.startsWith('ExponentPushToken') && !token.startsWith('ExpoPushToken')) {
    return res.status(400).json({ error: 'Invalid Expo push token format' });
  }
  await prisma.user.update({
    where: { id: req.user.userId },
    data: { pushToken: token },
  });
  res.json({ ok: true });
});

module.exports = router;
