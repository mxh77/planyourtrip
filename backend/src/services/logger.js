const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// Créer le répertoire logs s'il n'existe pas
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Écrire un message dans le fichier log + console
 * @param {string} category - Catégorie (ex: 'ROUTES', 'AUTH', 'PLACES')
 * @param {string} message - Message à logger
 * @param {object} data - Données optionnelles (JSON)
 */
function log(category, message, data = null) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${category}] ${message}`;
  
  if (data) {
    logLine += `\n  ${JSON.stringify(data, null, 2)}`;
  }
  
  // Écrire dans le fichier
  fs.appendFileSync(LOG_FILE, logLine + '\n', { encoding: 'utf8' });
  
  // Aussi afficher en console (console.log reste)
  console.log(logLine);
}

function error(category, message, error = null) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${category}] ❌ ERROR: ${message}`;
  
  if (error) {
    logLine += `\n  ${error.message}\n  ${error.stack}`;
  }
  
  fs.appendFileSync(LOG_FILE, logLine + '\n', { encoding: 'utf8' });
  console.error(logLine);
}

function getLogFile() {
  return LOG_FILE;
}

module.exports = { log, error, getLogFile };
