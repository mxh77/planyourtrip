const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const multer = require('multer');

const VALID_CATEGORIES = ['bug', 'evolution', 'question', 'other'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/markdown'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé'));
  },
});

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

// POST /api/suggestions — créer une suggestion (utilisateur authentifié)
router.post('/', upload.array('files', 5), async (req, res) => {
  const { content, category } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Le contenu de la suggestion est requis' });
  }

  const cat = category && VALID_CATEGORIES.includes(category) ? category : 'other';

  try {
    const uploadedFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const ext = file.originalname.split('.').pop() || 'bin';
        const storagePath = `suggestions/${req.user.userId}/${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`;
        const url = await uploadToStorage(file.buffer, file.mimetype, storagePath);
        uploadedFiles.push({ url, filename: file.originalname });
      }
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        userId: req.user.userId,
        content: content.trim(),
        category: cat,
        files: uploadedFiles,
      },
    });

    // Notification email admin (non-bloquant)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { name: true, email: true },
      }).catch(() => null);

      console.log(`[SUGGESTION] Nouvelle suggestion de ${user?.name || user?.email || req.user.userId} — catégorie: ${cat}`);
    }

    res.status(201).json(suggestion);
  } catch (err) {
    console.error('Erreur création suggestion:', err);
    res.status(500).json({ error: 'Erreur lors de la création de la suggestion' });
  }
});

module.exports = router;
