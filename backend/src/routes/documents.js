const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Type de fichier non autorisé: ' + file.mimetype));
  },
});

/**
 * Upload un buffer vers Supabase Storage (bucket "documents").
 * Retourne l'URL publique du fichier.
 */
async function uploadToStorage(buffer, mimeType, storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');

  const res = await fetch(`${supabaseUrl}/storage/v1/object/documents/${storagePath}`, {
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

  return `${supabaseUrl}/storage/v1/object/public/documents/${storagePath}`;
}

async function deleteFromStorage(storagePath) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return;
  await fetch(`${supabaseUrl}/storage/v1/object/documents/${storagePath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${serviceKey}`, Connection: 'close' },
  }).catch(() => {});
}

router.use(auth);

// GET /api/documents?accommodationId=&activityId=
router.get('/', async (req, res) => {
  const { accommodationId, activityId, roadtripId } = req.query;
  const where = { userId: req.user.userId };
  if (accommodationId) where.accommodationId = accommodationId;
  if (activityId)      where.activityId      = activityId;
  if (roadtripId)      where.roadtripId      = roadtripId;

  const docs = await prisma.document.findMany({ where, orderBy: { createdAt: 'asc' } });
  res.json(docs);
});

// POST /api/documents/upload — multipart/form-data
router.post('/upload', upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  const { id, accommodationId, activityId, roadtripId, name, caption } = req.body;

  const ext = req.file.originalname.split('.').pop() || 'bin';
  const storagePath = `documents/${req.user.userId}/${Date.now()}.${ext}`;

  try {
    const url = await uploadToStorage(req.file.buffer, req.file.mimetype, storagePath);

    const doc = await prisma.document.create({
      data: {
        ...(id ? { id } : {}),
        url,
        storagePath,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        name: name || req.file.originalname,
        caption: caption || null,
        userId: req.user.userId,
        accommodationId: accommodationId || null,
        activityId: activityId || null,
        roadtripId: roadtripId || null,
      },
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error('[DOCUMENTS] upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/documents/:id — upsert (PowerSync uploadData)
router.put('/:id', async (req, res) => {
  const { url, name, caption, storagePath, originalName, mimeType, fileSize, accommodationId, activityId, roadtripId } = req.body;

  const doc = await prisma.document.upsert({
    where: { id: req.params.id },
    create: {
      id: req.params.id,
      url: url || '',
      storagePath: storagePath || null,
      originalName: originalName || null,
      mimeType: mimeType || null,
      fileSize: fileSize || null,
      name: name || null,
      caption: caption || null,
      userId: req.user.userId,
      accommodationId: accommodationId || null,
      activityId: activityId || null,
      roadtripId: roadtripId || null,
    },
    update: {
      ...(name !== undefined && { name }),
      ...(caption !== undefined && { caption }),
    },
  });

  res.json(doc);
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, userId: req.user.userId },
  });

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (doc.storagePath) await deleteFromStorage(doc.storagePath);

  await prisma.document.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

module.exports = router;
async function extractText(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      // pdftotext (poppler) : fonctionne sur les PDFs natifs avec couche texte
      const { stdout } = await execFileAsync('pdftotext', [filePath, '-'], { maxBuffer: 10 * 1024 * 1024 })
      return stdout?.trim() || ''
    }
    if (
      mimetype === 'application/msword' ||
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const result = await mammoth.extractRawText({ path: filePath })
      return result.value?.trim() || ''
    }
    if (mimetype === 'text/plain') {
      return fs.readFileSync(filePath, 'utf-8').trim()
    }
  } catch (e) {
    console.warn('[extractText] Impossible d\'extraire le texte:', e.message)
  }
  return '' // images et PDFs scannés → fallback Vision géré par le tool IA
}

// Retourne le texte extrait d'un document (depuis fichier sidecar .txt)
function getExtractedTextPath(filename) {
  const base = path.parse(filename).name
  return path.join(UPLOADS_DIR, `${base}.extracted.txt`)
}

// ── Upload ────────────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

  // Extraction de texte en arrière-plan (non-bloquant pour la réponse)
  const filePath = path.join(UPLOADS_DIR, req.file.filename)
  extractText(filePath, req.file.mimetype).then(text => {
    if (text) {
      const txtPath = getExtractedTextPath(req.file.filename)
      fs.writeFileSync(txtPath, text, 'utf-8')
    }
  }).catch(() => {})

  res.json({
    id:           path.parse(req.file.filename).name,
    filename:     req.file.filename,
    originalname: req.file.originalname,
    size:         req.file.size,
    mimetype:     req.file.mimetype,
    uploadedAt:   new Date().toISOString(),
  })
})

// ── Téléchargement ────────────────────────────────────────────────────────────
router.get('/file/:filename', (req, res) => {
  // Protection contre la traversée de chemin
  const filename = path.basename(req.params.filename)
  const filePath = path.join(UPLOADS_DIR, filename)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Fichier introuvable' })
  }
  res.sendFile(filePath)
})

// ── Suppression ───────────────────────────────────────────────────────────────
router.delete('/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(UPLOADS_DIR, filename)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  // Supprime aussi le fichier texte extrait si présent
  const txtPath = getExtractedTextPath(filename)
  if (fs.existsSync(txtPath)) {
    fs.unlinkSync(txtPath)
  }
  res.json({ ok: true })
})

// ── Gestion des erreurs multer ────────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Fichier trop volumineux (max 5 Mo)' })
  }
  res.status(400).json({ error: err.message })
})

module.exports = router
