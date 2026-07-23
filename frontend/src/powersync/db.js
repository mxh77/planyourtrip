import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'planyourtrip.db' },
});

// Exécute du SQL directement sur la DB SQLite brute (sans CRUD tracking PowerSync)
// Exécute du SQL sur la DB brute, avec fallback powersync_replace_schema pour les vues
async function executeRaw(sql) {
  console.log('[DB] executeRaw:', sql.slice(0, 80));
  if (!db.database) throw new Error('db.database not available');

  try {
    await db.database.execute(sql);
    console.log('[DB] ✅ executeRaw OK');
  } catch (e) {
    // Si c'est une vue PowerSync → utiliser powersync_replace_schema
    if (e.message?.includes('Cannot add a column to a view')) {
      console.log('[DB] ⚠️ Vue PowerSync détectée, utilisation de powersync_replace_schema...');
      await db.database.writeTransaction((tx) =>
        tx.execute('SELECT powersync_replace_schema(?)', [JSON.stringify(AppSchema.toJSON())])
      );
      await db.database.refreshSchema();
      console.log('[DB] ✅ powersync_replace_schema OK');
    } else {
      throw e;
    }
  }
}

// Migration des colonnes ajoutées après la création initiale de la DB
export async function runMigrations() {
  const migrations = [
    `ALTER TABLE accommodations ADD COLUMN totalPrice REAL`,
    `ALTER TABLE accommodations ADD COLUMN depositPaid REAL`,
    `ALTER TABLE activities ADD COLUMN depositPaid REAL`,
    `ALTER TABLE accommodations ADD COLUMN amenities TEXT`,
    `ALTER TABLE roadtrips ADD COLUMN budgetTarget REAL`,
    `ALTER TABLE roadtrips ADD COLUMN budgetCurrency TEXT DEFAULT 'EUR'`,
    `ALTER TABLE roadtrips ADD COLUMN fuelConsumption REAL`,
    `ALTER TABLE roadtrips ADD COLUMN fuelType TEXT`,
    `ALTER TABLE roadtrips ADD COLUMN fuelPricePerL REAL`,
    `ALTER TABLE steps ADD COLUMN routeDistanceMeters INTEGER`,
    `ALTER TABLE steps ADD COLUMN routeDurationSeconds INTEGER`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      roadtripId TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'OTHER',
      label TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'EUR',
      paid INTEGER NOT NULL DEFAULT 0,
      paidById TEXT,
      stepId TEXT,
      date TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )`,
  ];
  for (const sql of migrations) {
    try {
      console.log('[Migration] Tentative:', sql.slice(0, 80));
      await executeRaw(sql);
      console.log('[Migration] ✅', sql.slice(0, 60));
    } catch (e) {
      if (e.message?.includes('duplicate column')) {
        console.log('[Migration] ℹ️ Colonne existe déjà:', sql.slice(0, 60));
      } else {
        console.warn('[Migration] ⚠️', sql.slice(0, 60), '→', e.message);
      }
    }
  }
}

// Migration de la table expenses (créée via le schéma PowerSync, donc normalement déjà présente)
export async function ensureExpensesTable() {
  try {
    await db.execute(`SELECT 1 FROM expenses LIMIT 1`);
  } catch {
    console.log('[Migration] La table expenses sera créée au prochain refresh PowerSync');
  }
}
