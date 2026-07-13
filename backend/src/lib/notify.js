/**
 * Notifications push Expo — Option D : agrégation par debounce.
 *
 * Toutes les modifications d'un roadtrip dans une fenêtre de 5 min de silence
 * sont regroupées en UN seul message envoyé une fois le calme revenu.
 *
 * Ex : Alice réorganise 4 étapes + ajoute un hébergement
 *  → Bob reçoit : "Alice · Road Trip Sud de la France"
 *                 "étape modifiée ×4, hébergement ajouté ×1"
 */
const prisma = require('./prisma');

const DEBOUNCE_MS = process.env.NODE_ENV === 'production'
  ? 5 * 60 * 1000      // 5 min en prod
  : 60 * 1000;         // 1 min en dev/test

// Map : roadtripId → { timer, counts: { label → n }, authorIds: Set }
const queue = new Map();

/**
 * Enfile une modification. L'envoi est repoussé de 5 min à chaque appel.
 *
 * @param {string} roadtripId
 * @param {string} authorId  - userId de l'auteur (exclu des destinataires)
 * @param {string} label     - ex: 'étape ajoutée', 'hébergement modifié'
 */
function notifyRoadtripMembers(roadtripId, authorId, label) {
  let entry = queue.get(roadtripId);
  if (!entry) {
    entry = { timer: null, counts: {}, authorIds: new Set() };
    queue.set(roadtripId, entry);
  }

  clearTimeout(entry.timer);
  entry.counts[label] = (entry.counts[label] ?? 0) + 1;
  entry.authorIds.add(authorId);

  entry.timer = setTimeout(() => flush(roadtripId), DEBOUNCE_MS);
}

async function flush(roadtripId) {
  const entry = queue.get(roadtripId);
  if (!entry) return;
  queue.delete(roadtripId);

  try {
    const [roadtrip, members] = await Promise.all([
      prisma.roadtrip.findUnique({
        where: { id: roadtripId },
        select: { title: true, userId: true },
      }),
      prisma.roadtripMember.findMany({
        where: { roadtripId, status: 'ACCEPTED' },
        select: { userId: true },
      }),
    ]);

    if (!roadtrip) return;

    const allIds = [roadtrip.userId, ...members.map(m => m.userId)];
    const recipientIds = [...new Set(allIds)].filter(id => !entry.authorIds.has(id));
    if (!recipientIds.length) return;

    const [recipients, authors] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: recipientIds }, pushToken: { not: null } },
        select: { pushToken: true },
      }),
      prisma.user.findMany({
        where: { id: { in: [...entry.authorIds] } },
        select: { name: true },
      }),
    ]);

    const tokens = recipients.map(u => u.pushToken).filter(Boolean);
    if (!tokens.length) return;

    const authorsStr = authors.map(a => a.name).join(' & ') || 'Un collaborateur';
    const summary = Object.entries(entry.counts)
      .map(([lbl, n]) => (n > 1 ? `${lbl} ×${n}` : lbl))
      .join(', ');

    const messages = tokens.map(to => ({
      to,
      title: `${authorsStr} · ${roadtrip.title}`,
      body: summary,
      sound: 'default',
      data: { roadtripId },
    }));

    const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
    const expoBody = await expoRes.json();

    const ts = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.log(`\x1b[2m${ts()}\x1b[0m [notify] flush roadtrip ${roadtripId}: ${summary}`);
    console.log(`\x1b[2m${ts()}\x1b[0m [notify] tokens: ${JSON.stringify(tokens)}`);
    console.log(`\x1b[2m${ts()}\x1b[0m [notify] expo response:`, JSON.stringify(expoBody));
  } catch (err) {
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    console.error(`\x1b[2m${ts}\x1b[0m [notify]`, err?.message);
  }
}

module.exports = { notifyRoadtripMembers };
