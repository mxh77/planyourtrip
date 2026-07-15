const express = require('express');
const fs = require('fs');
const { getLogFile } = require('../services/logger');

const router = express.Router();

/**
 * GET /api/debug/logs
 * Récupère le contenu du fichier log
 */
router.get('/logs', (req, res) => {
  try {
    const logFile = getLogFile();
    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ error: 'Fichier log non trouvé' });
    }
    
    const content = fs.readFileSync(logFile, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/debug/logs
 * Vide le fichier log
 */
router.delete('/logs', (req, res) => {
  try {
    const logFile = getLogFile();
    fs.writeFileSync(logFile, '', 'utf8');
    res.json({ message: 'Logs vidés' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
