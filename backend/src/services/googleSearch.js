/**
 * tavilySearch.js — Tavily Search API
 * Moteur de recherche optimisé pour les LLMs/agents.
 * Retourne les résultats avec titre, URL et contenu extrait.
 * 
 * Configuration requise dans .env :
 *   TAVILY_API_KEY — Clé API Tavily (commence par "tvly-")
 * 
 * Gratuit : 1 000 requêtes/mois — inscription : https://app.tavily.com/
 */
const axios = require('axios');

function isConfigured() {
  return !!(process.env.TAVILY_API_KEY);
}

/**
 * Cherche des URLs pertinentes pour un camping/hébergement
 * @param {string} query - Nom du camping + ville
 * @param {number} num - Nombre de résultats (max 10)
 * @returns {Promise<Array<{title: string, url: string, snippet: string}>>}
 */
async function searchCamping(query, num = 5) {
  if (!isConfigured()) {
    console.log('[tavilySearch] ⏭️ Non configuré — ajoutez TAVILY_API_KEY dans .env');
    return [];
  }

  const shortQuery = query.split(',')[0].trim().slice(0, 150);

  const searchQueries = [
    `${shortQuery} camping équipements services`,
    `${shortQuery}`,
  ];

  const seen = new Set();
  const results = [];

  for (const q of searchQueries) {
    if (results.length >= num) break;
    try {
      console.log('[tavilySearch] Recherche:', q);
      const resp = await axios.post('https://api.tavily.com/search', {
        query: q,
        search_depth: 'basic',
        max_results: Math.min(5, num - results.length + 2),
        include_answer: false,
        include_raw_content: false,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const items = resp.data?.results || [];
      for (const item of items) {
        const url = item.url;
        if (!url) continue;
        const cleanUrl = url.split('?')[0].split('#')[0];
        if (!seen.has(cleanUrl) && results.length < num) {
          seen.add(cleanUrl);
          results.push({
            title: item.title || '',
            url: cleanUrl,
            snippet: item.content || '',
          });
          console.log('[tavilySearch] ✅', cleanUrl, `("${(item.title || '').slice(0, 60)}")`);
        }
      }
    } catch (err) {
      const errorBody = err.response?.data;
      console.warn('[tavilySearch] Erreur:', err.response?.status, typeof errorBody === 'object' ? JSON.stringify(errorBody) : (errorBody || err.message));
    }
  }

  console.log('[tavilySearch] Total URLs trouvées:', results.length);
  return results;
}

module.exports = { searchCamping, isConfigured };
