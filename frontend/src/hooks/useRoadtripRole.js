import { useQuery } from '@powersync/react-native';
import { useAuthStore } from '../store/authStore';

/**
 * Hook qui retourne le rôle de l'utilisateur connecté sur un roadtrip donné.
 * Réactif via PowerSync : les changements de rôle sont pushés automatiquement.
 *
 * @param {string} roadtripId
 * @returns {{ role: 'OWNER'|'EDITOR'|'VIEWER'|null, isOwner: boolean, canEdit: boolean, canView: boolean, isLoading: boolean }}
 */
export function useRoadtripRole(roadtripId) {
  const userId = useAuthStore(s => s.user?.id);

  // Vérifie si l'utilisateur est le propriétaire du roadtrip (champ userId dans la table roadtrips)
  const { data: ownedRows, isLoading: ownerLoading } = useQuery(
    roadtripId && userId
      ? 'SELECT id FROM roadtrips WHERE id = ? AND userId = ?'
      : 'SELECT id FROM roadtrips WHERE 1=0',
    roadtripId && userId ? [roadtripId, userId] : []
  );

  // Lit le rôle depuis roadtrip_members (pushé par PowerSync en temps réel)
  const { data: memberRows, isLoading: memberLoading } = useQuery(
    roadtripId && userId
      ? 'SELECT role FROM roadtrip_members WHERE roadtripId = ? AND userId = ? AND status = "ACCEPTED"'
      : 'SELECT role FROM roadtrip_members WHERE 1=0',
    roadtripId && userId ? [roadtripId, userId] : []
  );

  const isOwner = (ownedRows?.length ?? 0) > 0;
  const role = isOwner ? 'OWNER' : (memberRows?.[0]?.role ?? null);

  return {
    role,
    isOwner,
    canEdit: role === 'OWNER' || role === 'EDITOR',
    canView: role !== null,
    isLoading: ownerLoading || memberLoading,
  };
}
