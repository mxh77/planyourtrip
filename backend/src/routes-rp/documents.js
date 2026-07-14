const express  = require('express')
const multer   = require('multer')
const path     = require('path')
const fs       = require('fs')
const { execFile } = require('child_process')
const { promisify } = require('util')
const { randomUUID } = require('crypto')
const mammoth  = require('mammoth')

const execFileAsync = promisify(execFile)

const router = express.Router()

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true })

const ALLOWED_MIMETYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '')
    cb(null, `${randomUUID()}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Type de fichier non autorisé : ${file.mimetype}`))
    }
  },
})

// ── Extraction de texte ───────────────────────────────────────────────────────
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
