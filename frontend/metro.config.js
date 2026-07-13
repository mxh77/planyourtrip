const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclure les dossiers de build Gradle dans node_modules du watcher
// (évite l'erreur ENOENT sur Windows quand ces dossiers sont nettoyés)
config.watchFolders = (config.watchFolders ?? []);
config.resolver.blockList = [
  /node_modules\/.*\/android\/build\/.*/,
  /node_modules\/.*\/\.gradle\/.*/,
];

module.exports = config;
