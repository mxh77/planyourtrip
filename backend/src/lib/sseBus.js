/**
 * sseBus.js — Bus SSE partagé entre devhub.js et devhubWebhook.js
 * Évite les dépendances circulaires en centralisant le Set de clients.
 *
 * Usage :
 *   const sseBus = require('./sseBus');
 *   sseBus.addClient(res);       // dans GET /events
 *   sseBus.removeClient(res);    // sur close
 *   sseBus.notify('run_updated', { ... });  // dans le webhook
 */

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

/**
 * Envoie un event SSE nommé à tous les clients connectés.
 * @param {string} event  Nom de l'event (ex: 'run_updated', 'orchestrator_tick')
 * @param {object} data   Payload JSON
 */
function notify(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(msg);
    } catch {
      clients.delete(res);
    }
  }
}

function clientCount() { return clients.size; }

module.exports = { addClient, removeClient, notify, clientCount };
