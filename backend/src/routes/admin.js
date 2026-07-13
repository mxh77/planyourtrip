const router = require('express').Router();
const prisma = require('../lib/prisma');
const auth = require('../middleware/auth');

async function requireAdmin(req, res, next) {
  const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isAdmin: true } });
  if (!user?.isAdmin) return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  next();
}

// ─── Utilisateurs ──────────────────────────────────────────────────────────────
router.get('/users', auth, requireAdmin, async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      emailVerifiedAt: true,
      createdAt: true,
      _count: { select: { roadtrips: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
});

// PATCH /api/admin/users/:id — modifier name, email, isAdmin
router.patch('/users/:id', auth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  // Empêcher un admin de se retirer ses propres droits admin
  if (id === req.user.userId && req.body.isAdmin === false) {
    return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits admin' });
  }

  const { name, email, isAdmin, verified } = req.body;
  const data = {};
  if (name !== undefined) data.name = name || null;
  if (email !== undefined) {
    // Vérifier que l'email n'est pas déjà utilisé par un autre utilisateur
    if (email !== '') {
      const existing = await prisma.user.findFirst({ where: { email, NOT: { id } } });
      if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }
    data.email = email;
  }
  if (isAdmin !== undefined) data.isAdmin = Boolean(isAdmin);
  if (verified !== undefined) data.emailVerifiedAt = verified ? new Date() : null;

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, isAdmin: true,
      emailVerifiedAt: true, createdAt: true,
      _count: { select: { roadtrips: true } },
    },
  });
  res.json(user);
});

// DELETE /api/admin/users/:id — supprimer un utilisateur
router.delete('/users/:id', auth, requireAdmin, async (req, res) => {
  const { id } = req.params;

  if (id === req.user.userId) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  await prisma.user.delete({ where: { id } });
  res.status(204).send();
});

// ─── Suggestions ───────────────────────────────────────────────────────────────

// GET /api/admin/suggestions — liste toutes les suggestions (avec ?search= et ?status=)
router.get('/suggestions', auth, requireAdmin, async (req, res) => {
  const { search, status } = req.query;

  const where = {};

  if (status === 'pending' || status === 'done') {
    where.status = status;
  }

  if (search && search.trim()) {
    const q = search.trim();
    where.OR = [
      { content: { contains: q, mode: 'insensitive' } },
      { user: { name:  { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
    ];
  }

  const suggestions = await prisma.suggestion.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  res.json(suggestions);
});

// PATCH /api/admin/suggestions/:id/status — basculer pending/done
router.patch('/suggestions/:id/status', auth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) return res.status(404).json({ error: 'Suggestion introuvable' });

  const updated = await prisma.suggestion.update({
    where: { id },
    data: { status: suggestion.status === 'pending' ? 'done' : 'pending' },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  res.json(updated);
});

// DELETE /api/admin/suggestions/:id — supprimer une suggestion
router.delete('/suggestions/:id', auth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const suggestion = await prisma.suggestion.findUnique({ where: { id } });
  if (!suggestion) return res.status(404).json({ error: 'Suggestion introuvable' });

  await prisma.suggestion.delete({ where: { id } });
  res.status(204).send();
});

// POST /api/admin/suggestions/:id/convert-to-issue — créer une GitHub Issue
router.post('/suggestions/:id/convert-to-issue', auth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { force } = req.body;

  const suggestion = await prisma.suggestion.findUnique({
    where: { id },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!suggestion) return res.status(404).json({ error: 'Suggestion introuvable' });

  if (suggestion.githubIssueNumber && !force) {
    return res.status(409).json({
      error: 'Une issue GitHub existe déjà pour cette suggestion',
      githubIssueNumber: suggestion.githubIssueNumber,
      githubIssueUrl: suggestion.githubIssueUrl,
    });
  }

  const githubPat   = process.env.GITHUB_PAT;
  const githubOwner = process.env.GITHUB_OWNER;
  const githubRepo  = process.env.GITHUB_REPO;

  if (!githubPat || !githubOwner || !githubRepo) {
    return res.status(503).json({ error: 'GitHub non configuré (GITHUB_PAT, GITHUB_OWNER, GITHUB_REPO manquants)' });
  }

  const labelMap = {
    bug:       'bug',
    evolution: 'enhancement',
    question:  'question',
    other:     'help wanted',
  };

  const author = suggestion.user?.name || suggestion.user?.email || 'Utilisateur inconnu';
  const body = `**Suggestion de :** ${author}\n**Catégorie :** ${suggestion.category}\n**Date :** ${new Date(suggestion.createdAt).toLocaleDateString('fr-FR')}\n\n---\n\n${suggestion.content}`;

  try {
    const ghRes = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${githubPat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title: `[Suggestion] ${suggestion.content.substring(0, 80)}${suggestion.content.length > 80 ? '…' : ''}`,
        body,
        labels: [labelMap[suggestion.category] || 'help wanted'],
      }),
    });

    if (!ghRes.ok) {
      const detail = await ghRes.text();
      return res.status(502).json({ error: `GitHub API error: ${detail}` });
    }

    const issue = await ghRes.json();

    const updated = await prisma.suggestion.update({
      where: { id },
      data: {
        githubIssueNumber: issue.number,
        githubIssueUrl: issue.html_url,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.json(updated);
  } catch (err) {
    console.error('Erreur GitHub Issue:', err);
    res.status(500).json({ error: 'Erreur lors de la création de l\'issue GitHub' });
  }
});

module.exports = router;
