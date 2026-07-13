const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB par photo
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

async function uploadToStorage(buffer, mimeType, storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

  const res = await fetch(`${supabaseUrl}/storage/v1/object/photos/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': mimeType,
      Connection: 'close',
    },
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Supabase Storage upload failed: ${detail}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/photos/${storagePath}`;
}

router.use(auth);

// POST /api/beta/feedback — soumettre un feedback beta (avec photos optionnelles)
router.post('/feedback', upload.array('photos', 5), async (req, res) => {
  const { text, audioUrl } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Le texte du feedback est requis' });
  }

  try {
    // Upload des photos vers Supabase Storage
    const photoUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const ext = file.mimetype.split('/')[1] || 'jpg';
        const storagePath = `feedback/${req.user.userId}/${Date.now()}_${Math.floor(Math.random()*1e6)}.${ext}`;
        const url = await uploadToStorage(file.buffer, file.mimetype, storagePath);
        photoUrls.push(url);
      }
    }

    const feedback = await prisma.betaFeedback.create({
      data: {
        userId: req.user.userId,
        text: text.trim(),
        audioUrl: audioUrl || null,
        photoUrls,
        type: req.body.type || 'AUTRE',
      },
    });

    res.status(201).json(feedback);
  } catch (err) {
    console.error('[BETA] feedback error:', err);
    res.status(500).json({ error: 'Impossible de sauvegarder le feedback' });
  }
});

// GET /api/beta/feedbacks — lister tous les feedbacks (admin uniquement)
router.get('/feedbacks', requireAdmin, async (req, res) => {
  const feedbacks = await prisma.betaFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  res.json(feedbacks);
});

// PATCH /api/beta/feedbacks/:id — modifier type ou isHandled (admin uniquement)
router.patch('/feedbacks/:id', requireAdmin, async (req, res) => {
  const { type, isHandled } = req.body;
  const data = {};

  if (type !== undefined) {
    const valid = ['BUG', 'SUGGESTION', 'QUESTION', 'AUTRE'];
    if (!valid.includes(type)) return res.status(400).json({ error: 'Type invalide' });
    data.type = type;
  }
  if (isHandled !== undefined) {
    data.isHandled = Boolean(isHandled);
    data.handledAt = isHandled ? new Date() : null;
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Aucun champ à modifier' });

  try {
    const fb = await prisma.betaFeedback.update({
      where: { id: req.params.id },
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json(fb);
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Feedback introuvable' });
    console.error('[BETA] patch error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
