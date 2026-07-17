import { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/react-native';
import API_URL from '../api/config';
import { useAuthStore } from '../store/authStore';

// Tag logcat distinct selon la variante (visible dans : adb logcat -s ReactNativeJS)
const TAG = __DEV__ ? '[MPR_Debug][PowerSync]' : '[MPR][PowerSync]';

/**
 * Tente un refresh silencieux si le token d'accès est expiré.
 * Retourne le token valide ou null si non récupérable.
 */
async function getValidToken(getToken) {
  const token = await getToken();
  if (!token) return null;

  // Vérification légère : décoder le payload sans vérifier la signature
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresSoon = payload.exp && payload.exp < Math.floor(Date.now() / 1000) + 60;
    if (expiresSoon) {
      const newToken = await useAuthStore.getState().silentRefresh();
      return newToken;
    }
  } catch {
    // Impossible de décoder → utiliser le token tel quel
  }
  return token;
}

/**
 * Connecteur PowerSync — fournit le token JWT à PowerSync
 * et délègue les mutations à notre API Express.
 */
export class AppConnector {
  constructor(getToken) {
    this.getToken = getToken;
  }

  async fetchCredentials() {
    let token = await getValidToken(this.getToken);
    if (!token) throw new Error('Not authenticated');

    console.log(TAG, 'fetchCredentials → API_URL:', API_URL);

    let res = await fetch(`${API_URL}/api/auth/powersync-token`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    console.log(TAG, 'powersync-token status:', res.status);

    // Token expiré → silent refresh et retry
    if (res.status === 401) {
      console.log(TAG, '401 → silent refresh');
      token = await useAuthStore.getState().silentRefresh();
      if (!token) throw new Error('Not authenticated');
      res = await fetch(`${API_URL}/api/auth/powersync-token`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(TAG, 'retry status:', res.status);
    }

    if (!res.ok) throw new Error('Failed to fetch PowerSync token');

    const data = await res.json();
    const { token: psToken, powersyncUrl, userId } = data;

    console.log(TAG, 'fetchCredentials result:', {
      endpoint: powersyncUrl,
      tokenLength: psToken?.length,
      userId,
    });

    return {
      endpoint: powersyncUrl,
      token: psToken,
    };
  }

  // Appelé par PowerSync quand le réseau revient pour syncer les mutations locales
  async uploadData(database) {
    const batch = await database.getCrudBatch(200);
    if (!batch) return;

    console.log(TAG, `uploadData — ${batch.crud.length} op(s) en queue:`,
      batch.crud.map(e => `${e.op} ${e.table}/${e.id.slice(0, 8)} isPending=${e.opData?.isPending}`).join(' | ')
    );

    const token = await getValidToken(this.getToken);
    if (!token) {
      console.warn(TAG, 'uploadData — no auth token → batch.cancel()');
      await batch.cancel();
      return;
    }

    for (const entry of batch.crud) {
      const { op, table, id, opData } = entry;
      const url = `${API_URL}/api/${table}/${id}`;

      // ─── Photos : upload binaire offline-first ─────────────────────────────
      if (table === 'photos') {
        if (op === 'PUT' && (opData.isPending === 1 || opData.isPending === '1')) {
          try {
            const formData = new FormData();
            formData.append('photo', { uri: opData.url, name: `photo_${id}.jpg`, type: 'image/jpeg' });
            formData.append('id', id);
            if (opData.stepId)          formData.append('stepId', opData.stepId);
            if (opData.roadtripId)      formData.append('roadtripId', opData.roadtripId);
            if (opData.accommodationId) formData.append('accommodationId', opData.accommodationId);
            if (opData.activityId)      formData.append('activityId', opData.activityId);
            const photoRes = await fetch(`${API_URL}/api/photos/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });
            if (photoRes.ok) {
              const uploaded = await photoRes.json();
              console.log(TAG, 'photo uploaded OK:', id, uploaded.url);
              await database.execute(
                'UPDATE photos SET url = ?, isPending = 0 WHERE id = ?',
                [uploaded.url, id]
              );
              // Si l'URI locale était la photo de carte de l'étape, mettre à jour step.photoUrl
              if (opData.stepId && opData.url && opData.url !== uploaded.url) {
                await database.execute(
                  'UPDATE steps SET photoUrl = ? WHERE id = ? AND photoUrl = ?',
                  [uploaded.url, opData.stepId, opData.url]
                );
              }
            } else if (photoRes.status >= 500) {
              // Erreur serveur → on annule tout, PowerSync réessaiera plus tard
              console.warn(TAG, 'photo upload 5xx → batch.cancel()', photoRes.status, id);
              await batch.cancel();
              return;
            }
            // 4xx (URI inaccessible, mauvais format…) : on marque comme non-pending
            // pour débloquer la queue sans perdre la métadonnée locale
            else {
              console.warn(TAG, 'photo upload', photoRes.status, '→ isPending=0, skipping:', id);
              await database.execute('UPDATE photos SET isPending = 0 WHERE id = ?', [id]);
            }
          } catch (e) {
            const msg = e?.message || String(e);
            console.error(TAG, 'photo upload catch:', id, msg);
            if (msg === 'Network request failed') {
              // "Network request failed" arrive aussi quand le fichier URI est illisible
              // (cache ImagePicker nettoyé). On distingue les deux cas avec un ping réseau.
              try {
                await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
                // Ping OK → réseau fonctionnel → c'est le fichier qui manque
                console.warn(TAG, 'photo file gone (network OK), skipping:', id);
                await database.execute('UPDATE photos SET isPending = 0 WHERE id = ?', [id]);
              } catch {
                // Ping KO → vrai problème réseau → retry plus tard
                console.warn(TAG, 'photo upload network error → batch.cancel()');
                await batch.cancel();
                return;
              }
            } else {
              console.warn(TAG, 'photo file not accessible, skipping:', id);
              await database.execute('UPDATE photos SET isPending = 0 WHERE id = ?', [id]);
            }
          }
        } else if (op === 'DELETE') {
          try {
            const delRes = await fetch(`${API_URL}/api/photos/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!delRes.ok && delRes.status !== 404) {
              console.warn(TAG, 'photo DELETE', delRes.status, '→ batch.cancel()', id);
              await batch.cancel();
              return;
            }
            console.log(TAG, 'photo DELETE OK:', id);
          } catch (e) {
            const msg = e?.message || String(e);
            console.error(TAG, 'photo DELETE catch:', id, msg);
            if (msg === 'Network request failed') {
              await batch.cancel();
              return;
            }
            // Autre erreur → skip ce DELETE (la photo est peut-être déjà absente)
          }
        }
        // PUT avec isPending=0 (post-upload) : serveur déjà à jour via le POST → skip
        continue;
      }

      // ─── Documents : upload binaire offline-first ──────────────────────────
      if (table === 'documents') {
        if (op === 'PUT' && (opData.isPending === 1 || opData.isPending === '1')) {
          try {
            // Déterminer le type MIME et l'extension depuis l'URI ou le nom
            const uri = opData.url || '';
            const ext = uri.split('.').pop()?.toLowerCase() || 'bin';
            const mimeMap = {
              pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
              png: 'image/png', webp: 'image/webp', doc: 'application/msword',
              docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              txt: 'text/plain', csv: 'text/csv',
              xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
            const mimeType = mimeMap[ext] || 'application/octet-stream';

            const formData = new FormData();
            formData.append('document', { uri, name: opData.name || `doc_${id}.${ext}`, type: mimeType });
            formData.append('id', id);
            formData.append('name', opData.name || `doc_${id}.${ext}`);
            if (opData.accommodationId) formData.append('accommodationId', opData.accommodationId);
            if (opData.activityId)      formData.append('activityId', opData.activityId);
            if (opData.roadtripId)      formData.append('roadtripId', opData.roadtripId);

            const docRes = await fetch(`${API_URL}/api/documents/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            });

            if (docRes.ok) {
              const uploaded = await docRes.json();
              console.log(TAG, 'document uploaded OK:', id, uploaded.url);
              await database.execute(
                'UPDATE documents SET url = ?, isPending = 0 WHERE id = ?',
                [uploaded.url, id]
              );
            } else if (docRes.status >= 500) {
              console.warn(TAG, 'document upload 5xx → batch.cancel()', docRes.status, id);
              await batch.cancel();
              return;
            } else {
              console.warn(TAG, 'document upload', docRes.status, '→ isPending=0, skipping:', id);
              await database.execute('UPDATE documents SET isPending = 0 WHERE id = ?', [id]);
            }
          } catch (e) {
            const msg = e?.message || String(e);
            console.error(TAG, 'document upload catch:', id, msg);
            if (msg === 'Network request failed') {
              try {
                await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
                console.warn(TAG, 'document file gone (network OK), skipping:', id);
                await database.execute('UPDATE documents SET isPending = 0 WHERE id = ?', [id]);
              } catch {
                console.warn(TAG, 'document upload network error → batch.cancel()');
                await batch.cancel();
                return;
              }
            } else {
              console.warn(TAG, 'document file not accessible, skipping:', id);
              await database.execute('UPDATE documents SET isPending = 0 WHERE id = ?', [id]);
            }
          }
        } else if (op === 'DELETE') {
          try {
            const delRes = await fetch(`${API_URL}/api/documents/${id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!delRes.ok && delRes.status !== 404) {
              console.warn(TAG, 'document DELETE', delRes.status, '→ batch.cancel()', id);
              await batch.cancel();
              return;
            }
            console.log(TAG, 'document DELETE OK:', id);
          } catch (e) {
            const msg = e?.message || String(e);
            console.error(TAG, 'document DELETE catch:', id, msg);
            if (msg === 'Network request failed') {
              await batch.cancel();
              return;
            }
          }
        }
        // PUT avec isPending=0 : skip
        continue;
      }

      let method = op; // déclaré hors du try pour être accessible dans le catch
      try {
        // Si un step a un photoUrl local dans le CRUD log (content:// ou file://),
        // c'est que uploadData a déjà uploadé la photo et mis à jour le SQLite local.
        // On relit la valeur actuelle pour envoyer l'URL Supabase au backend.
        let effectiveOpData = opData ?? {};
        if (table === 'steps' && opData?.photoUrl) {
          const isLocal = opData.photoUrl.startsWith('file://') || opData.photoUrl.startsWith('content://');
          if (isLocal) {
            const result = await database.execute('SELECT photoUrl FROM steps WHERE id = ?', [id]);
            const currentUrl = result.rows?.item?.(0)?.photoUrl;
            if (currentUrl && !currentUrl.startsWith('file://') && !currentUrl.startsWith('content://')) {
              effectiveOpData = { ...opData, photoUrl: currentUrl };
            }
          }
        }

        let body;
        if (op === 'PUT') {
          method = 'PUT';
          body = JSON.stringify(effectiveOpData);
        } else if (op === 'PATCH') {
          method = 'PATCH';
          body = JSON.stringify(effectiveOpData);
        } else if (op === 'DELETE') {
          method = 'DELETE';
        } else {
          continue;
        }
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          ...(body ? { body } : {}),
        });

        // 401 = token invalide → cancel (PowerSync reconnectera)
        if (res.status === 401) {
          console.warn(TAG, `${method} ${table}/${id} → 401 → batch.cancel()`);
          await batch.cancel();
          return;
        }
        // 5xx = erreur serveur → cancel (réessayer plus tard)
        if (res.status >= 500) {
          console.warn(TAG, `${method} ${table}/${id} → ${res.status} → batch.cancel()`);
          await batch.cancel();
          return;
        }
        // 4xx (403, 404, 409...) = op irrécupérable → skip pour débloquer la queue
        if (!res.ok) {
          console.warn(TAG, `${method} ${table}/${id} → ${res.status} → skip (irrécupérable)`);
          continue;
        }
        console.log(TAG, `${method} ${table}/${id} → OK (${res.status})`);
      } catch (e) {
        const msg = e?.message || String(e);
        console.error(TAG, `${method} ${table}/${id} catch: ${msg} → batch.cancel()`);
        // Erreur réseau — on annule le batch, PowerSync réessaiera plus tard
        await batch.cancel();
        return;
      }
    }

    console.log(TAG, 'batch.complete() — toutes les ops traitées');
    await batch.complete();
  }
}
