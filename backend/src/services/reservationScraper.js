/**
 * reservationScraper.js
 * Analyse le site d'un camping sur plusieurs pages pour détecter si les
 * réservations en ligne sont possibles ou explicitement refusées.
 */
const axios   = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7,it;q=0.6,es;q=0.5',
};

// Plateformes de réservation reconnues dans URL, iframe ou script
const RESERVATION_PROVIDERS = [
  { name: 'Webcamp',         patterns: [/webcamp\.fr/i] },
  { name: 'Kampaoh',         patterns: [/kampaoh\.com/i] },
  { name: 'Booking.com',     patterns: [/booking\.com/i] },
  { name: 'Pitchup',         patterns: [/pitchup\.com/i] },
  { name: 'Hipcamp',         patterns: [/hipcamp\.com/i] },
  { name: 'Homecamper',      patterns: [/homecamper\.fr/i] },
  { name: 'CampingCar Park', patterns: [/campingcar-park\.com/i] },
  { name: 'Campings.fr',     patterns: [/campings\.fr/i] },
  { name: 'Campsite',        patterns: [/campsite\.co\.uk/i] },
  { name: 'Eurocampings',    patterns: [/eurocampings\.(fr|co\.uk|de|it|es)/i] },
  { name: 'Reservit',        patterns: [/reservit\.com/i] },
  { name: 'E-Camping',       patterns: [/e-camping\.net/i] },
  { name: 'LeisureVerse',    patterns: [/leisureverse\.com/i] },
  { name: 'Guestline',       patterns: [/guestline\.net/i] },
  { name: 'RMS',             patterns: [/rms\.solutions/i] },
  { name: 'Aloha',           patterns: [/aloha-management\.fr/i] },
  { name: 'Campman',         patterns: [/campman\.com/i] },
  { name: 'CampScout',       patterns: [/campscout\.com/i] },
  { name: 'iCamp',           patterns: [/icamp\.online/i] },
];

// Signaux POSITIFS : réservation en ligne proposée
const POSITIVE_KEYWORDS = [
  /r[ée]server\s*(en\s*ligne|ici|maintenant|votre|un\s*emplacement)/i,
  /r[ée]servation\s*(en\s*ligne|en\s*direct|disponible|online)/i,
  /book\s*(now|online|here|your\s*pitch|a\s*pitch)/i,
  /online\s*booking/i,
  /booking\s*online/i,
  /prenotaz[io]+ne\s*(online|sul\s*sito|diretta)/i,   // italien
  /reserva\s*(online|en\s*l[ií]nea)/i,               // espagnol
  /disponibilit[ée][s]?\s*(en\s*ligne|vérif)/i,
  /v[ée]rifier\s*les\s*disponibilit[ée]s/i,
  /check\s*(availability|dates)/i,
  /choisir\s*(une\s*)?date/i,
  /s[ée]lectionner\s*(une\s*)?date/i,
  /select\s*(your\s*)?dates?/i,
  /emplacement[s]?\s*(disponible[s]?|libre[s]?)/i,
  /réserv[ea]\s*(votre|un)\s*(emplacement|pitch|parcelle)/i,
];

// Signaux NÉGATIFS : pas de réservation, arrivée directe uniquement
const NEGATIVE_KEYWORDS = [
  // Anglais
  /reservations?\s*not\s*accepted/i,
  /no\s*reservations?\s*(accepted|possible|available)/i,
  /we\s*do\s*not\s*accept\s*reservations?/i,
  /bookings?\s*not\s*accepted/i,
  /no\s*online\s*bookings?/i,
  /no\s*advance\s*booking/i,
  /first[\s-]come[\s,\s]*first[\s-]served/i,
  /walk[\s-]?in\s*only/i,
  /arrivals?\s*only\s*(no\s*reservation|without\s*reservation)/i,
  /without\s*prior\s*reservation/i,
  /no\s*pre[\s-]?booking/i,
  // Français
  /pas\s*de\s*r[ée]servation/i,
  /sans\s*r[ée]servation/i,
  /r[ée]servation[s]?\s*non\s*accept[ée]e?s?/i,
  /premier\s*arriv[ée]\s*(,\s*)?premier\s*servi/i,
  /sans\s*pr[ée]avis/i,
  /aucune\s*r[ée]servation/i,
  /accueil\s*sans\s*r[ée]servation/i,
  // Italien
  /non\s*(si\s*)?accett[ai]\s*(prenotaz[io]+ni|riserve)/i,
  /senza\s*prenotaz[io]+ne/i,
  /prenotaz[io]+ni\s*non\s*accettate/i,
  /solo\s*in\s*loco/i,
  /arrivo\s*(diretto|libero)/i,
  // Espagnol
  /sin\s*reserva/i,
  /no\s*se\s*aceptan\s*reservas?/i,
  /reservas?\s*no\s*aceptadas?/i,
];

// Sous-pages susceptibles de contenir la politique de réservation
const SUBPAGE_SLUGS = [
  'reservation', 'reservations', 'book', 'booking', 'bookings',
  'tarifs', 'tarif', 'prices', 'price', 'prix', 'tariffe', 'precios',
  'prenotazione', 'prenotazioni', 'reserva', 'reservas',
  'reglement', 'rules', 'regulations', 'regolamento', 'reglamento',
  'prices-and-rules', 'tarifs-et-reglement', 'info', 'informations',
  'contact', 'contatti', 'accueil',
];

// Chemins à tenter directement si l'extraction des liens échoue (multi-langue)
const FALLBACK_PATHS = [
  '/en/prices-and-rules/', '/en/prices/', '/en/booking/', '/en/reservations/', '/en/rules/',
  '/fr/tarifs/', '/fr/reservation/', '/fr/reglements/', '/fr/prix/',
  '/it/prezzi/', '/it/prenotazione/', '/it/regolamento/', '/it/tariffe/',
  '/es/precios/', '/es/reservas/', '/es/tarifas/',
  '/prices/', '/tarifs/', '/booking/', '/reservations/', '/prenotazioni/', '/tariffe/',
  '/prices-and-rules/', '/tarifs-reglement/', '/reglement/', '/reglamento/',
];

function detectProviderFromUrl(url) {
  for (const p of RESERVATION_PROVIDERS) {
    if (p.patterns.some(rx => rx.test(url))) return p.name;
  }
  return null;
}

/**
 * Fetche une URL avec timeout, retourne null si erreur
 */
async function fetchPage(url, timeout = 10000) {
  try {
    const resp = await axios.get(url, {
      headers: HEADERS,
      timeout,
      maxRedirects: 5,
      validateStatus: s => s < 400,
    });
    return resp.data;
  } catch {
    return null;
  }
}

/**
 * Extrait les sous-liens internes d'une page qui ressemblent à des pages de réservation/tarifs
 */
function extractSubpageLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = new Set();

  $('a[href]').each((_, el) => {
    const raw = $(el).attr('href') || '';
    try {
      const resolved = new URL(raw, baseUrl);
      // Même domaine uniquement
      if (resolved.hostname !== base.hostname) return;
      const path = resolved.pathname.toLowerCase();
      // Correspondance avec les slugs cibles
      if (SUBPAGE_SLUGS.some(s => path.includes(s))) {
        links.add(resolved.href.split('#')[0]); // sans ancre
      }
      // Aussi les liens dont le texte contient des mots-clés réservation/tarifs
      const text = $(el).text().toLowerCase();
      if (/(r[ée]serv|book|tarif|price|prix|prenotaz|reserv|regol|rules|prix)/.test(text)) {
        links.add(resolved.href.split('#')[0]);
      }
    } catch { /* URL invalide */ }
  });

  return [...links].slice(0, 8); // max 8 sous-pages
}

/**
 * Analyse le HTML d'une page et retourne les signaux trouvés
 */
function analyzePage(html) {
  const $ = cheerio.load(html);
  const providers = new Set();
  const positiveSignals = [];
  const negativeSignals = [];

  // Plateformes dans les ressources embarquées
  $('iframe[src], script[src], a[href], link[href]').each((_, el) => {
    const url = $(el).attr('src') || $(el).attr('href') || '';
    const p = detectProviderFromUrl(url);
    if (p) providers.add(p);
  });

  // Texte brut de la page (sans scripts/styles)
  $('script, style, noscript').remove();
  const bodyText = $.html().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Signaux positifs
  for (const rx of POSITIVE_KEYWORDS) {
    const m = bodyText.match(rx);
    if (m) positiveSignals.push(m[0].trim().slice(0, 80));
  }

  // Liens / boutons réservation
  $('a, button, input[type=submit]').each((_, el) => {
    const text = ($(el).text() + ' ' + ($(el).attr('value') || '') + ' ' + ($(el).attr('href') || '')).trim();
    if (POSITIVE_KEYWORDS.some(rx => rx.test(text))) {
      positiveSignals.push(`Bouton/Lien: "${text.slice(0, 60)}"`);
    }
    const href = $(el).attr('href') || '';
    const p = detectProviderFromUrl(href);
    if (p) providers.add(p);
  });

  // Calendriers / formulaires de dates
  const hasDatePicker = $(
    'input[type=date], [class*="datepick"], [class*="calendar"], [id*="calendar"],' +
    '[class*="booking-form"], [id*="booking"], [class*="reservation-form"],' +
    '[id*="reservation"], [class*="check-in"], [class*="checkin"]'
  ).length > 0;

  // Signaux négatifs
  for (const rx of NEGATIVE_KEYWORDS) {
    const m = bodyText.match(rx);
    if (m) negativeSignals.push(m[0].trim().slice(0, 100));
  }

  return {
    providers: [...providers],
    positiveSignals,
    negativeSignals,
    hasDatePicker,
  };
}

/**
 * Point d'entrée : scrape homepage + sous-pages pertinentes
 */
async function checkCampingReservation(websiteUrl) {
  if (!websiteUrl) {
    return { status: 'no_website', acceptsReservation: null, message: 'Pas de site web renseigné' };
  }

  const siteProvider = detectProviderFromUrl(websiteUrl);

  // ── Étape 1 : homepage ──────────────────────────────────────────────────────
  const homeHtml = await fetchPage(websiteUrl);

  if (!homeHtml) {
    if (siteProvider) {
      return {
        status: 'reservation_found', acceptsReservation: true,
        message: `Réservation via ${siteProvider}`, providers: [siteProvider], signals: [],
      };
    }
    return { status: 'error', acceptsReservation: null, message: 'Site inaccessible', providers: [], signals: [] };
  }

  // ── Étape 2 : sous-pages via liens de la homepage ──────────────────────────
  let subpageUrls = extractSubpageLinks(homeHtml, websiteUrl);

  // ── Étape 3 : si peu de sous-pages trouvées, bruteforce des chemins courants ─
  if (subpageUrls.length < 3) {
    const base = new URL(websiteUrl).origin;
    const fallbackResults = await Promise.all(
      FALLBACK_PATHS.map(async path => {
        const url = base + path;
        // HEAD rapide pour vérifier si la page existe
        try {
          await axios.head(url, { headers: HEADERS, timeout: 4000, validateStatus: s => s === 200 });
          return url;
        } catch { return null; }
      })
    );
    const newUrls = fallbackResults.filter(Boolean);
    // Fusionner sans doublons
    subpageUrls = [...new Set([...subpageUrls, ...newUrls])].slice(0, 10);
  }

  // ── Étape 4 : scraper toutes les sous-pages (en parallèle) ─────────────────
  const subpageHtmls = await Promise.all(subpageUrls.map(u => fetchPage(u, 8000)));

  // ── Étape 5 : analyser toutes les pages ─────────────────────────────────────
  const allPages = [homeHtml, ...subpageHtmls.filter(Boolean)];
  const allProviders = new Set(siteProvider ? [siteProvider] : []);
  const allPositive = [];
  const allNegative = [];
  let hasDatePicker = false;

  for (const html of allPages) {
    const r = analyzePage(html);
    r.providers.forEach(p => allProviders.add(p));
    allPositive.push(...r.positiveSignals);
    allNegative.push(...r.negativeSignals);
    if (r.hasDatePicker) hasDatePicker = true;
  }

  const providers = [...allProviders];
  // Dédupliquer les signaux
  const positiveSignals = [...new Set(allPositive)];
  const negativeSignals = [...new Set(allNegative)];

  // ── Décision ────────────────────────────────────────────────────────────────
  // Priorité aux signaux négatifs (mention explicite "pas de réservation")
  if (negativeSignals.length > 0 && providers.length === 0 && positiveSignals.length === 0 && !hasDatePicker) {
    return {
      status: 'no_reservation',
      acceptsReservation: false,
      message: 'Réservations non acceptées — arrivée directe uniquement',
      providers: [],
      signals: negativeSignals,
    };
  }

  // Signal négatif mais aussi quelques signaux positifs → ambigu, pencher négatif
  if (negativeSignals.length > 0 && providers.length === 0 && !hasDatePicker) {
    return {
      status: 'no_reservation',
      acceptsReservation: false,
      message: 'Probablement sans réservation (signaux mixtes)',
      providers: [],
      signals: [...negativeSignals, ...positiveSignals],
    };
  }

  if (providers.length > 0) {
    return {
      status: 'reservation_found',
      acceptsReservation: true,
      message: `Réservation via ${providers.join(', ')}`,
      providers,
      signals: positiveSignals,
    };
  }

  if (positiveSignals.length > 0 || hasDatePicker) {
    return {
      status: 'reservation_likely',
      acceptsReservation: true,
      message: 'Réservation en ligne probable',
      providers: [],
      signals: positiveSignals,
    };
  }

  return {
    status: 'unknown',
    acceptsReservation: null,
    message: `Impossible de déterminer (${allPages.length} page(s) analysée(s))`,
    providers: [],
    signals: [],
  };
}

module.exports = { checkCampingReservation };

