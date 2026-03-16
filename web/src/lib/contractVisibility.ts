/**
 * Shared visibility predicate for contract lists.
 *
 * A contract is visible to a viewer when ANY of the following hold:
 *  1. The contract is unrestricted (no allowedCharacters AND no allowedTribes).
 *  2. The viewer is the poster.
 *  3. The viewer's character ID is in allowedCharacters.
 *  4. The viewer's in-game tribe ID is in allowedTribes.
 *
 * If the viewer has no identity (wallet not connected), only unrestricted
 * contracts are shown.
 */

/** Minimal contract shape shared by TrustlessContractData & MultiInputContractData. */
interface RestrictableContract {
  posterId: string;
  allowedCharacters: string[];
  allowedTribes: number[];
}

interface ViewerIdentity {
  characterId: string | null;
  inGameTribeId: number | null;
}

export function canViewContract(
  contract: RestrictableContract,
  viewer: ViewerIdentity,
): boolean {
  const hasCharRestriction = contract.allowedCharacters.length > 0;
  const hasTribeRestriction = contract.allowedTribes.length > 0;

  // Unrestricted contracts are visible to everyone
  if (!hasCharRestriction && !hasTribeRestriction) return true;

  // No identity → restricted contracts are hidden
  if (!viewer.characterId) return false;

  // Poster always sees their own contracts
  if (contract.posterId === viewer.characterId) return true;

  // Check character allow-list
  if (hasCharRestriction && contract.allowedCharacters.includes(viewer.characterId)) {
    return true;
  }

  // Check tribe allow-list
  if (
    hasTribeRestriction &&
    viewer.inGameTribeId != null &&
    contract.allowedTribes.includes(viewer.inGameTribeId)
  ) {
    return true;
  }

  return false;
}
