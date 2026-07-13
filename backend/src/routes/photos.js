const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/**
 * Upload un buffer vers Supabase Storage (bucket "photos").
 * Retourne l'URL publique du fichier.
 */
async function uploadToStorage(buffer, mimeType, storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  }

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

/**
 * Supprime un fichier du bucket Supabase Storage.
 * Silencieux si le fichier est introuvable.
 */
async function deleteFromStorage(storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;

  await fetch(`${supabaseUrl}/storage/v1/object/photos/${storagePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serviceKey}`, Connection: 'close' },
  }).catch(() => {});
}

router.use(auth);

// GET /api/photos?stepId=&roadtripId=
router.get('/', async (req, res) => {
  const { stepId, roadtripId, accommodationId, activityId } = req.query;

  const where = { userId: req.user.userId };
  if (stepId)          where.stepId          = stepId;
  if (roadtripId)      where.roadtripId      = roadtripId;
  if (accommodationId) where.accommodationId = accommodationId;
  if (activityId)      where.activityId      = activityId;

  const photos = await prisma.photo.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  res.json(photos);
});

// POST /api/photos/upload — multipart/form-data
router.post('/upload', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const { id, stepId, roadtripId, accommodationId, activityId, caption, isCover } = req.body;

  const ext = req.file.originalname.split('.').pop() || 'jpg';
  const storagePath = `${req.user.userId}/${Date.now()}.${ext}`;

  try {
    const url = await uploadToStorage(req.file.buffer, req.file.mimetype, storagePath);

    const photo = await prisma.photo.create({
      data: {
        ...(id ? { id } : {}),
        url,
        cloudinaryId: storagePath,
        caption:         caption         || null,
        isCover:         isCover === 'true',
        userId:          req.user.userId,
        stepId:          stepId          || null,
        roadtripId:      roadtripId      || null,
        accommodationId: accommodationId || null,
        activityId:      activityId      || null,
      },
    });

    res.status(201).json(photo);
  } catch (err) {
    console.error('[PHOTOS] upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/photos/:id — upsert (utilisé par PowerSync uploadData)
router.put('/:id', async (req, res) => {
  const { url, caption, isCover, stepId, roadtripId, accommodationId, activityId, cloudinaryId } = req.body;

  const photo = await prisma.photo.upsert({
    where: { id: req.params.id },
    create: {
      id:              req.params.id,
      url:             url             || '',
      cloudinaryId:    cloudinaryId    || null,
      caption:         caption         || null,
      isCover:         isCover         ?? false,
      userId:          req.user.userId,
      stepId:          stepId          || null,
      roadtripId:      roadtripId      || null,
      accommodationId: accommodationId || null,
      activityId:      activityId      || null,
    },
    update: {
      ...(caption  !== undefined && { caption }),
      ...(isCover  !== undefined && { isCover }),
    },
  });

  res.json(photo);
});

// DELETE /api/photos/:id
router.delete('/:id', async (req, res) => {
  const photo = await prisma.photo.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });

  if (!photo) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  if (photo.cloudinaryId) {
    await deleteFromStorage(photo.cloudinaryId);
  }

  await prisma.photo.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

module.exports = router;
