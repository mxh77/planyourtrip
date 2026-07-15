/**
 * Service de logging pour React Native/Expo
 * Permet de tracer les problèmes et exporter les logs
 */

const LOGS = [];
const MAX_LOGS = 5000; // Garder les 5000 derniers logs
const ENABLE_CONSOLE = true; // Afficher aussi dans console
const ENABLE_STORAGE = true; // Sauvegarder en mémoire
const LOG_INTERVAL_THRESHOLD = 100; // Millisecondes entre les logs (alerte si < threshold)

let lastLogTime = {};

/**
 * Log un message
 * @param {string} category - Catégorie (ex: 'ROUTES', 'STEPS', 'REFRESH')
 * @param {string} message - Message
 * @param {any} data - Données optionnelles
 */
function log(category, message, data = null) {
  const timestamp = new Date().toISOString();
  const now = Date.now();
  
  // Détecter les logs trop rapides (boucle infinie?) — silencieux, pas de warn
  if (lastLogTime[category]) {
    const timeSinceLastLog = now - lastLogTime[category];
    if (timeSinceLastLog < LOG_INTERVAL_THRESHOLD) {
      lastLogTime[category] = now;  // Reset pour éviter le spam
      return;  // Ignorer ce log, il est trop proche du précédent
    }
  }
  lastLogTime[category] = now;

  const entry = {
    timestamp,
    category,
    message,
    data,
  };

  if (ENABLE_STORAGE) {
    LOGS.push(entry);
    // Garder seulement les derniers N logs pour éviter la fuite mémoire
    if (LOGS.length > MAX_LOGS) {
      LOGS.shift();
    }
  }

  if (ENABLE_CONSOLE) {
    console.log(`[${category}] ${message}`, data ? JSON.stringify(data) : '');
  }
}

/**
 * Log une erreur
 */
function error(category, message, err = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    category,
    level: 'ERROR',
    message,
    error: err ? { message: err.message, stack: err.stack } : null,
  };

  if (ENABLE_STORAGE) {
    LOGS.push(entry);
    if (LOGS.length > MAX_LOGS) {
      LOGS.shift();
    }
  }

  if (ENABLE_CONSOLE) {
    console.error(`[${category}] ❌ ${message}`, err);
  }
}

/**
 * Log un warning
 */
function warn(category, message, data = null) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    category,
    level: 'WARN',
    message,
    data,
  };

  if (ENABLE_STORAGE) {
    LOGS.push(entry);
    if (LOGS.length > MAX_LOGS) {
      LOGS.shift();
    }
  }

  if (ENABLE_CONSOLE) {
    console.warn(`[${category}] ⚠️ ${message}`, data ? JSON.stringify(data) : '');
  }
}

/**
 * Récupérer tous les logs sous forme de string
 */
function getLogsAsString() {
  return LOGS
    .map((entry) => {
      let line = `[${entry.timestamp}] [${entry.category}]`;
      if (entry.level) line += ` [${entry.level}]`;
      line += ` ${entry.message}`;
      if (entry.data) {
        line += `\n  Data: ${JSON.stringify(entry.data)}`;
      }
      if (entry.error) {
        line += `\n  Error: ${entry.error.message}`;
        if (entry.error.stack) {
          line += `\n  Stack: ${entry.error.stack}`;
        }
      }
      return line;
    })
    .join('\n');
}

/**
 * Récupérer les logs en JSON
 */
function getLogsAsJson() {
  return LOGS;
}

/**
 * Vider tous les logs
 */
function clearLogs() {
  LOGS.length = 0;
  log('LOGGER', '🗑️ Logs vidés');
}

/**
 * Exporter les logs comme fichier texte
 * (à implémenter selon votre système de fichiers)
 */
function exportLogs() {
  const content = getLogsAsString();
  return {
    content,
    timestamp: new Date().toISOString(),
    count: LOGS.length,
  };
}

/**
 * Faire un snapshot du compte de logs à un moment donné
 * Utile pour déterminer combien de logs ont été créés
 */
function captureSnapshot(label = 'Snapshot') {
  const count = LOGS.length;
  log('LOGGER', `📸 ${label}: ${count} logs actuellement`);
  return count;
}

export { log, error, warn, getLogsAsString, getLogsAsJson, clearLogs, exportLogs, captureSnapshot };
