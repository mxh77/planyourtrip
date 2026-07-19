import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: { dbFilename: 'planyourtrip.db' },
});

// Migration des colonnes ajoutées après la création initiale de la DB
export async function runMigrations() {
  const migrations = [
    `ALTER TABLE accommodations ADD COLUMN totalPrice REAL`,
    `ALTER TABLE accommodations ADD COLUMN depositPaid REAL`,
    `ALTER TABLE activities ADD COLUMN depositPaid REAL`,
    `ALTER TABLE accommodations ADD COLUMN amenities TEXT`,
  ];
  for (const sql of migrations) {
    try {
      await db.execute(sql);
      console.log('[Migration] ✅', sql);
    } catch (e) {
      // La colonne existe déjà → pas une erreur
      if (!e.message?.includes('duplicate column')) {
        console.warn('[Migration] ⚠️', sql, e.message);
      }
    }
  }
}
