/**
 * scraper.js — Scraping avec Playwright (headless Chromium)
 * Permet de récupérer le contenu de pages web chargées via JavaScript
 * (React, onglets dynamiques, etc.) que axios ne peut pas voir.
 * 
 * Utilisation : remplacer axios.get() par scraper.fetchPageText(url)
 * pour les pages qui nécessitent du rendu JS.
 */
const { chromium } = require('playwright');
const path = require('path');

let _browser = null;

async function getBrowser() {
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    console.log('[scraper] 🚀 Browser Chromium lancé');
  }
  return _browser;
}

/**
 * Ferme le navigateur (appeler lors de l'arrêt du serveur)
 */
async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
    console.log('[scraper] 🛑 Browser fermé');
  }
}

/**
 * Récupère le texte d'une page web avec rendu JavaScript
 * @param {string} url - URL à scraper
 * @param {object} options
 * @param {number} options.timeout - Timeout en ms (défaut: 15000)
 * @param {number} options.waitAfterLoad - ms à attendre après le chargement pour laisser le JS s'exécuter (défaut: 3000)
 * @param {string[]} options.waitForSelectors - Sélecteurs CSS à attendre avant d'extraire
 * @returns {Promise<{text: string, url: string}>}
 */
async function fetchPageText(url, options = {}) {
  const { timeout = 15000, waitAfterLoad = 3000, waitForSelectors = [] } = options;
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'fr-FR',
  });
  const page = await context.newPage();

  try {
    console.log('[scraper] Fetching:', url);
    await page.goto(url, { waitUntil: 'load', timeout });

    // Attendre des sélecteurs spécifiques si demandé
    for (const selector of waitForSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
      } catch {
        // Ignorer si le sélecteur n'existe pas
      }
    }

    // Laisser le temps au JS de s'exécuter
    if (waitAfterLoad > 0) {
      await page.waitForTimeout(waitAfterLoad);
    }

    // Cliquer sur les onglets courants pour révéler le contenu
    const tabSelectors = [
      'button[role="tab"]',
      '[data-tab]',
      '.tab-link',
      '.tabs button',
      '[data-toggle="tab"]',
    ];
    for (const sel of tabSelectors) {
      try {
        const tabs = await page.$$(sel);
        for (const tab of tabs) {
          const text = await tab.textContent();
          // Cliquer sur les onglets pertinents
          const lower = text.toLowerCase();
          if (lower.includes('equipement') || lower.includes('service') || lower.includes('activite') || lower.includes('restaurant')) {
            await tab.click();
            await page.waitForTimeout(500);
            console.log('[scraper] 👆 Cliqué onglet:', text.trim());
          }
        }
      } catch { /* ignore */ }
    }

    // Extraire le texte de la page (body uniquement)
    const text = await page.evaluate(() => {
      const body = document.body;
      if (!body) return '';
      // Enlever scripts, styles, noscript
      const clone = body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg, [aria-hidden="true"]').forEach(el => el.remove());
      return clone.textContent || '';
    });

    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();

    console.log('[scraper] ✅', url, '-', cleaned.length, 'chars');
    return { text: cleaned, url };

  } catch (err) {
    console.warn('[scraper] ❌', url, '-', err.message);
    return { text: '', url };
  } finally {
    await context.close();
  }
}

// Fermer le navigateur proprement à l'arrêt du processus
process.on('SIGINT', async () => { await closeBrowser(); process.exit(0); });
process.on('SIGTERM', async () => { await closeBrowser(); process.exit(0); });

module.exports = { fetchPageText, closeBrowser };
