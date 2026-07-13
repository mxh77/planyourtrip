/**
 * openai.js — Intégration OpenAI avec function calling (tool use)
 * Chat assistant enrichi du contexte de l'itinéraire + appels d'outils réels
 */
const OpenAI = require('openai');
const path   = require('path');
const fs     = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const gm     = require('./googleMaps');
const camping = require('./camping');
const trails  = require('./trails');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const execFileAsync = promisify(execFile);

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY)
      throw Object.assign(new Error('OPENAI_API_KEY non configurée'), { status: 503 });
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

let _deepseekClient = null;
function getDeepSeekClient() {
  if (!_deepseekClient) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key)
      throw Object.assign(new Error('DEEPSEEK_API_KEY non configurée'), { status: 503 });
    _deepseekClient = new OpenAI({ apiKey: key, baseURL: 'https://api.deepseek.com' });
  }
  return _deepseekClient;
}

function resolveClient(model) {
  if (model && model.startsWith('deepseek')) return getDeepSeekClient();
  return getClient();
}

// ── Outils disponibles pour l'IA ─────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_campings_near_location',
      description: 'Recherche des campings proches d\'un lieu donné via Google Places. Retourne nom, note, site web, coordonnées.',
      parameters: {
        type: 'object',
        properties: {
          lat:     { type: 'number', description: 'Latitude du lieu' },
          lng:     { type: 'number', description: 'Longitude du lieu' },
          radius:  { type: 'number', description: 'Rayon de recherche en mètres (défaut 20000)' },
          keyword: { type: 'string', description: 'Mot-clé optionnel (ex: "piscine", "bord de mer")' },
        },
        required: ['lat', 'lng'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_places_of_interest',
      description: 'Recherche des points d\'intérêt (restaurants, musées, plages, activités) proches d\'un lieu.',
      parameters: {
        type: 'object',
        properties: {
          lat:     { type: 'number' },
          lng:     { type: 'number' },
          type:    { type: 'string', description: 'Type Google Places: tourist_attraction, restaurant, museum, beach, etc.' },
          keyword: { type: 'string', description: 'Mot-clé de recherche' },
          radius:  { type: 'number', description: 'Rayon en mètres' },
        },
        required: ['lat', 'lng'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_hiking_trails',
      description: 'Recherche des sentiers de randonnée près d\'une position.',
      parameters: {
        type: 'object',
        properties: {
          lat:    { type: 'number' },
          lng:    { type: 'number' },
          radius: { type: 'number', description: 'Rayon en mètres (défaut 15000)' },
        },
        required: ['lat', 'lng'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_camping_availability_kampaoh',
      description: 'Vérifie la disponibilité d\'un camping Kampaoh (Espagne/Portugal) pour des dates données.',
      parameters: {
        type: 'object',
        properties: {
          propertyId: { type: 'string', description: 'ID de la propriété Kampaoh' },
          checkin:    { type: 'string', description: 'Date d\'arrivée YYYY-MM-DD' },
          checkout:   { type: 'string', description: 'Date de départ YYYY-MM-DD' },
        },
        required: ['propertyId', 'checkin', 'checkout'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_place_details',
      description: 'Obtient les détails complets d\'un lieu (horaires, avis, photos, contact).',
      parameters: {
        type: 'object',
        properties: {
          placeId: { type: 'string', description: 'Google Place ID' },
        },
        required: ['placeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_route',
      description: 'Calcule la distance et la durée entre deux points ou sur un itinéraire complet.',
      parameters: {
        type: 'object',
        properties: {
          origin:      { type: 'string', description: 'Lieu de départ (nom ou "lat,lng")' },
          destination: { type: 'string', description: 'Lieu d\'arrivée' },
          waypoints:   { type: 'array', items: { type: 'string' }, description: 'Points intermédiaires optionnels' },
        },
        required: ['origin', 'destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_content',
      description: 'Lit le contenu textuel d\'un document attaché à une étape (confirmation de réservation, PDF, etc.). Utilise cet outil quand l\'utilisateur pose une question sur un document.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'Nom du fichier (ex: "abc123.pdf")' },
          originalname: { type: 'string', description: 'Nom original du document pour contexte' },
        },
        required: ['filename'],
      },
    },
  },
];

// ── Exécution des outils ──────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {
    case 'search_campings_near_location':
      return gm.searchNearby({ ...args, type: 'campground', language: 'fr' });

    case 'search_places_of_interest':
      return gm.searchNearby({ ...args, language: 'fr' });

    case 'search_hiking_trails':
      return trails.searchTrailsOSM(args.lat, args.lng, args.radius || 15000);

    case 'check_camping_availability_kampaoh':
      return camping.checkKampaoh(args.propertyId, args.checkin, args.checkout);

    case 'get_place_details':
      return gm.getPlaceDetails({ placeId: args.placeId });

    case 'calculate_route':
      return gm.getDirections({
        origin:      args.origin,
        destination: args.destination,
        waypoints:   args.waypoints || [],
      });

    case 'get_document_content': {
      const filename = path.basename(args.filename);
      const base = path.parse(filename).name;
      const txtPath = path.join(UPLOADS_DIR, `${base}.extracted.txt`);
      const rawPath = path.join(UPLOADS_DIR, filename);

      // 1. Sidecar déjà extrait → retour immédiat
      if (fs.existsSync(txtPath)) {
        const cached = fs.readFileSync(txtPath, 'utf-8');
        if (cached.trim()) return { filename, content: cached.substring(0, 8000) };
      }

      if (!fs.existsSync(rawPath)) {
        return { error: `Fichier introuvable : ${filename}` };
      }

      // 2. PDF → pdftotext (natif)
      if (filename.endsWith('.pdf')) {
        try {
          const { stdout } = await execFileAsync('pdftotext', [rawPath, '-'], { maxBuffer: 10 * 1024 * 1024 });
          const text = stdout?.trim() || '';
          if (text.length > 50) {
            fs.writeFileSync(txtPath, text, 'utf-8');
            return { filename, content: text.substring(0, 8000) };
          }
        } catch (_) {}

        // 3. PDF scanné → Vision IA (pdftoppm → PNG → DeepSeek Vision)
        try {
          const pngBase = path.join(UPLOADS_DIR, `${base}_p1`);
          await execFileAsync('pdftoppm', ['-png', '-f', '1', '-l', '3', '-r', '150', rawPath, pngBase]);
          const pages = [1, 2, 3].map(i => `${pngBase}-${i}.png`).filter(p => fs.existsSync(p));
          if (pages.length === 0) throw new Error('Aucune page PNG générée');

          const visionClient = getDeepSeekClient();
          const imageContent = pages.map(p => ({
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` },
          }));
          // Nettoyage des PNG temporaires
          pages.forEach(p => { try { fs.unlinkSync(p); } catch (_) {} });

          const visionResp = await visionClient.chat.completions.create({
            model: 'deepseek-vl2',
            messages: [{
              role: 'user',
              content: [
                ...imageContent,
                { type: 'text', text: 'Extrais et retranscris fidèlement tout le texte visible dans ce document (confirmation de réservation, facture, etc.). Garde la structure lisible.' },
              ],
            }],
            max_tokens: 2000,
          });
          const extracted = visionResp.choices[0].message.content || '';
          if (extracted) fs.writeFileSync(txtPath, extracted, 'utf-8');
          return { filename, content: extracted.substring(0, 8000) };
        } catch (e) {
          return { error: `Impossible de lire ce PDF : ${e.message}` };
        }
      }

      // 4. Fichier texte brut
      if (filename.endsWith('.txt')) {
        const content = fs.readFileSync(rawPath, 'utf-8');
        return { filename, content: content.substring(0, 8000) };
      }

      return { error: `Type de fichier non supporté pour la lecture : ${filename}` };
    }

    default:
      return { error: `Outil inconnu : ${name}` };
  }
}

// ── Chat principal ────────────────────────────────────────────────────────────

async function chat({ messages, itineraryContext, selectedWaypoint = null, stream = false, preferences = {}, model: requestedModel }) {
  const resolvedModel = requestedModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const client = resolveClient(resolvedModel);

  const systemPrompt = buildSystemPrompt(itineraryContext, preferences, selectedWaypoint);

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  if (stream) {
    // Retourne le stream directement (géré dans la route)
    return client.chat.completions.create({
      model:          resolvedModel,
      messages:       allMessages,
      tools:          TOOLS,
      tool_choice:    'auto',
      stream:         true,
      temperature:    0.7,
      max_tokens:     1500,
    });
  }

  // ── Mode non-stream avec tool calling agentic loop ────────────────────
  let response = await client.chat.completions.create({
    model:       resolvedModel,
    messages:    allMessages,
    tools:       TOOLS,
    tool_choice: 'auto',
    temperature: 0.7,
    max_tokens:  2000,
  });

  const toolCalls = [];
  // Agentic loop : l'IA peut appeler plusieurs outils en chaîne
  let iterations = 0;
  while (response.choices[0].finish_reason === 'tool_calls' && iterations < 5) {
    iterations++;
    const msg       = response.choices[0].message;
    const calls     = msg.tool_calls || [];
    const toolMsgs  = [];

    for (const call of calls) {
      const args   = JSON.parse(call.function.arguments);
      const result = await executeTool(call.function.name, args);
      toolCalls.push({ name: call.function.name, args, result });
      toolMsgs.push({
        role:         'tool',
        tool_call_id: call.id,
        content:      JSON.stringify(result),
      });
    }

    allMessages.push(msg, ...toolMsgs);
    response = await client.chat.completions.create({
      model:       resolvedModel,
      messages:    allMessages,
      tools:       TOOLS,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens:  2000,
    });
  }

  return {
    content:   response.choices[0].message.content,
    toolCalls,
    usage:     response.usage,
    model:     resolvedModel,
  };
}

// ── Suggestions d'itinéraire (sans historique) ────────────────────────────────

async function suggestItinerary({ departure, destination, duration, preferences }) {
  const client = getClient();
  const model  = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const prompt = `Tu es un expert en road trips. Génère un itinéraire de ${duration} jours entre ${departure} et ${destination}.
Préférences: ${JSON.stringify(preferences)}.

Réponds en JSON strict avec ce format:
{
  "title": "Titre de l'itinéraire",
  "description": "Description courte",
  "waypoints": [
    {
      "order": 1,
      "name": "Nom du lieu",
      "location": "Ville, Pays",
      "nights": 2,
      "description": "Pourquoi cette étape",
      "highlights": ["activité 1", "activité 2"],
      "campingKeyword": "camping bord de mer"
    }
  ],
  "tips": ["conseil 1", "conseil 2"]
}`;

  const resp = await client.chat.completions.create({
    model,
    messages:        [{ role: 'user', content: prompt }],
    temperature:     0.8,
    max_tokens:      2000,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(resp.choices[0].message.content);
}

// ── Analyse des contraintes camping ──────────────────────────────────────────

async function analyzeCampingConstraints({ campings, checkin, checkout, groupSize }) {
  const client = getClient();
  const model  = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const summaries = campings.slice(0, 10).map(c => ({
    name:   c.name,
    rating: c.rating,
    types:  c.types,
    review: c.reviews?.[0]?.text?.slice(0, 200),
  }));

  const prompt = `Analyse ces ${campings.length} campings pour un séjour du ${checkin} au ${checkout} (${groupSize} personnes).
Données: ${JSON.stringify(summaries)}

Donne en JSON:
{
  "recommended": [{ "name": "...", "reason": "...", "score": 8.5 }],
  "concerns": ["préoccupation 1"],
  "tips": ["conseil spécifique"]
}`;

  const resp = await client.chat.completions.create({
    model,
    messages:        [{ role: 'user', content: prompt }],
    temperature:     0.4,
    max_tokens:      800,
    response_format: { type: 'json_object' },
  });

  return JSON.parse(resp.choices[0].message.content);
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx, prefs, selectedWaypoint = null) {
  let prompt = `Tu es **RoadTrip AI**, un assistant expert en planification de voyages, camping, randonnée et découverte locale. Tu es enthousiaste, précis et très utile.

Tu peux utiliser des outils pour rechercher des campings réels, des sentiers, calculer des itinéraires et vérifier des disponibilités.

**Règles importantes :**
- Réponds toujours en français (sauf si demandé autrement)
- Si on te demande de trouver des campings ou des activités, utilise TOUJOURS les outils disponibles pour avoir des données réelles
- Sois concret : donne des noms réels, des distances, des prix si disponibles
- Pour les campings, mentionne toujours : note Google, site web si disponible, particularités
- Pour les randonnées, précise : difficulté, dénivelé, durée estimée
- Format tes réponses avec du Markdown (gras, listes, etc.)
- Si l'utilisateur pose une question sur un document (réservation, confirmation, etc.), utilise l'outil **get_document_content** pour en lire le contenu`;

  if (ctx) {
    prompt += `\n\n**Itinéraire en cours :**
- Nom : ${ctx.name || 'Sans nom'}
- Étapes : ${ctx.waypoints?.length || 0}`;

    if (ctx.waypoints?.length) {
      prompt += `\n- Points de passage : ${ctx.waypoints.map(w => w.name).join(' → ')}`;

      // Liste les documents disponibles par étape
      const waypointsWithDocs = ctx.waypoints.filter(w => {
        try {
          const sc = typeof w.selectedCamping === 'string' ? JSON.parse(w.selectedCamping) : w.selectedCamping;
          return sc?.documents?.length > 0;
        } catch { return false; }
      });
      if (waypointsWithDocs.length > 0) {
        prompt += `\n\n**📎 Documents attachés aux étapes :**`;
        for (const w of waypointsWithDocs) {
          const sc = typeof w.selectedCamping === 'string' ? JSON.parse(w.selectedCamping) : w.selectedCamping;
          for (const doc of sc.documents) {
            prompt += `\n- Étape "${w.name}" → "${doc.originalname}" (fichier: ${doc.filename})`;
          }
        }
        prompt += `\nPour lire le contenu d'un document, utilise l'outil get_document_content avec le filename correspondant.`;
      }
    }

    if (selectedWaypoint) {
      const arr = selectedWaypoint.arrivalDate ? new Date(selectedWaypoint.arrivalDate).toLocaleDateString('fr-FR') : null;
      const dep = selectedWaypoint.departureDate ? new Date(selectedWaypoint.departureDate).toLocaleDateString('fr-FR') : null;
      prompt += `\n\n**⚠️ ÉTAPE ACTUELLEMENT SÉLECTIONNÉE (utilise ces coordonnées pour les recherches) :**
- Nom : ${selectedWaypoint.name}
- Adresse : ${selectedWaypoint.address || 'non renseignée'}
- Coordonnées : lat=${selectedWaypoint.lat}, lng=${selectedWaypoint.lng}${arr ? `\n- Arrivée : ${arr}` : ''}${dep ? `\n- Départ : ${dep}` : ''}`;

      // Documents de cette étape
      try {
        const sc = typeof selectedWaypoint.selectedCamping === 'string'
          ? JSON.parse(selectedWaypoint.selectedCamping)
          : selectedWaypoint.selectedCamping;
        if (sc?.documents?.length > 0) {
          prompt += `\n- Camping sélectionné : ${sc.name || 'inconnu'}`;
          prompt += `\n- Documents attachés à cette étape :`;
          for (const doc of sc.documents) {
            prompt += `\n  • "${doc.originalname}" (filename: ${doc.filename})`;
          }
          prompt += `\n  → Utilise get_document_content pour lire ces documents si l'utilisateur en parle.`;
        }
      } catch (_) {}

      prompt += `\n\nQuand l'utilisateur dit "ici", "cette étape", "le coin", etc., il parle de cette étape. Utilise ses coordonnées pour toute recherche de campings, randonnées ou activités.`;
    }
    if (ctx.preferences) {
      try {
        const p = typeof ctx.preferences === 'string' ? JSON.parse(ctx.preferences) : ctx.preferences;
        if (p.groupSize)   prompt += `\n- Groupe : ${p.groupSize} personnes`;
        if (p.startDate)   prompt += `\n- Départ : ${p.startDate}`;
        if (p.endDate)     prompt += `\n- Retour : ${p.endDate}`;
        if (p.vehicleType) prompt += `\n- Véhicule : ${p.vehicleType}`;
        if (p.budget)      prompt += `\n- Budget : ${p.budget}`;
      } catch (_) {}
    }
  }

  if (prefs?.interests?.length) {
    prompt += `\n\n**Intérêts de l'utilisateur :** ${prefs.interests.join(', ')}`;
  }

  return prompt;
}

module.exports = { chat, suggestItinerary, analyzeCampingConstraints };
