#!/usr/bin/env node
// scripts/inject-context.js
// Met à jour copilot-instructions.md et docs/contexts/INDEX.md
// Usage : node scripts/inject-context.js <context-file> <instructions-file> <contexts-dir>

const fs = require('fs');
const path = require('path');

const MAX_LINES = 1000;
const [,, contextFile, instructionsFile, contextsDir] = process.argv;

if (!contextFile || !instructionsFile || !contextsDir) {
  console.error('Usage: node inject-context.js <context-file> <instructions-file> <contexts-dir>');
  process.exit(1);
}

// ─── Validation taille du fichier de contexte ─────────────────────────────────
const contextContent = fs.readFileSync(contextFile, 'utf8').replace(/\r\n/g, '\n');
const lineCount = contextContent.split('\n').length;
if (lineCount > MAX_LINES) {
  console.error(`ERREUR : Le fichier de contexte dépasse ${MAX_LINES} lignes (${lineCount} lignes). Résume le contenu avant de continuer.`);
  process.exit(1);
}

// ─── Lire tous les fichiers de contexte du répertoire ────────────────────────
const allContextFiles = fs.readdirSync(contextsDir)
  .filter(f => f.endsWith('.md') && f !== 'INDEX.md')
  .sort()
  .reverse(); // du plus récent au plus ancien

const latestFile = path.basename(contextFile);

// ─── Construire la section auto pour copilot-instructions.md ─────────────────
const previousFiles = allContextFiles.filter(f => f !== latestFile);

let autoSection = contextContent.trim();

if (previousFiles.length > 0) {
  autoSection += '\n\n---\n\n**Contextes des conversations précédentes** (dans `docs/contexts/`) :';
  for (const f of previousFiles) {
    // Extraire la première ligne (titre) du fichier pour le label
    const filePath = path.join(contextsDir, f);
    const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0].replace(/^#+ /, '').trim();
    autoSection += `\n- \`${f}\` — ${firstLine}`;
  }
}

// ─── Mettre à jour copilot-instructions.md ───────────────────────────────────
const START = '<!-- CONTEXT-AUTO:START -->';
const END = '<!-- CONTEXT-AUTO:END -->';

const instructions = fs.readFileSync(instructionsFile, 'utf8').replace(/\r\n/g, '\n');

if (!instructions.includes(START)) {
  console.error(`Erreur : marqueur "${START}" introuvable dans ${instructionsFile}`);
  process.exit(1);
}

const pattern = new RegExp(START + '[\\s\\S]*?' + END);
const replacement = `${START}\n${autoSection}\n${END}`;
fs.writeFileSync(instructionsFile, instructions.replace(pattern, replacement), 'utf8');

// ─── Mettre à jour docs/contexts/INDEX.md ────────────────────────────────────
let index = '# Index des contextes de conversation\n\n';
index += '| Fichier | Feature | Date |\n';
index += '|---------|---------|------|\n';

for (const f of allContextFiles) {
  const filePath = path.join(contextsDir, f);
  const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0].replace(/^#+ /, '').trim();
  // Extraire date + heure depuis le nom de fichier (YYYY-MM-DD_HHMMSS ou YYYY-MM-DD)
  const dateMatch = f.match(/^(\d{4}-\d{2}-\d{2})(?:_(\d{2})(\d{2})(\d{2}))?/);
  let dateLabel = dateMatch ? dateMatch[1] : '?';
  if (dateMatch && dateMatch[2]) dateLabel += ` ${dateMatch[2]}:${dateMatch[3]}:${dateMatch[4]}`;
  index += `| \`${f}\` | ${firstLine} | ${dateLabel} |\n`;
}

fs.writeFileSync(path.join(contextsDir, 'INDEX.md'), index, 'utf8');

console.log('✓ Contexte sauvegardé');
