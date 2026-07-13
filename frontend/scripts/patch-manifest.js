#!/usr/bin/env node
// Injecte la clé Google Maps dans AndroidManifest.xml après expo prebuild

const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
if (!apiKey) {
  console.error('✗ EXPO_PUBLIC_GOOGLE_PLACES_API_KEY manquante dans .env');
  process.exit(1);
}

const manifestPath = path.resolve(__dirname, '../android/app/src/main/AndroidManifest.xml');
let content = fs.readFileSync(manifestPath, 'utf8');

const META_TAG = `<meta-data android:name="com.google.android.geo.API_KEY" android:value="${apiKey}"/>`;

if (content.includes('com.google.android.geo.API_KEY')) {
  // Mettre à jour la valeur si déjà présente
  content = content.replace(
    /android:name="com\.google\.android\.geo\.API_KEY"\s+android:value="[^"]*"/,
    `android:name="com.google.android.geo.API_KEY" android:value="${apiKey}"`
  );
  console.log('✓ Clé Google Maps mise à jour dans AndroidManifest.xml');
} else {
  // Insérer juste après l'ouverture de <application ...>
  content = content.replace(
    /(<application[^>]*>)/,
    `$1\n    ${META_TAG}`
  );
  console.log('✓ Clé Google Maps injectée dans AndroidManifest.xml');
}

fs.writeFileSync(manifestPath, content, 'utf8');

// Vérification
if (content.includes(apiKey)) {
  console.log('✓ Vérification OK — clé présente dans le manifest');
} else {
  console.error('✗ Échec de l\'injection');
  process.exit(1);
}
