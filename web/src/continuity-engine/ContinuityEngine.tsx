/**
 * Continuity Engine — iframe wrapper for the puzzle-service.
 *
 * Embeds the Go/HTMX puzzle service as a full-height iframe, passing the
 * connected wallet's address as the `player` query param so the puzzle
 * service can identify the player.
 */

import styled from "styled-components";
import { useIdentity } from "../hooks/useIdentity";
import { config } from "../config";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  min-height: 0;
`;

const Frame = styled.iframe`
  flex: 1;
  width: 100%;
  border: none;
  background: ${({ theme }) => theme.colors.surface.bg};
`;

const NoWallet = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 14px;
`;

export function ContinuityEngine() {
  const { address, isLoading } = useIdentity();

  if (isLoading) {
    return (
      <Wrapper>
        <LoadingSpinner />
      </Wrapper>
    );
  }

  if (!address) {
    return (
      <Wrapper>
        <NoWallet>Connect a wallet to access the Continuity Engine.</NoWallet>
      </Wrapper>
    );
  }

  const puzzleUrl = `${config.puzzleServiceUrl}?player=${encodeURIComponent(address)}`;

  return (
    <Wrapper>
      <Frame src={puzzleUrl} title="Continuity Engine" allow="clipboard-write" />
    </Wrapper>
  );
}

/**
 * Dapp variant — used in the SSU iframe shell (/dapp/continuity/:entityId).
 * Includes the entity_id in the puzzle-service URL path.
 */
export function ContinuityEngineDapp({ entityId }: { entityId?: string }) {
  const { address, isLoading } = useIdentity();

  if (isLoading) {
    return (
      <Wrapper>
        <LoadingSpinner />
      </Wrapper>
    );
  }

  if (!address) {
    return (
      <Wrapper>
        <NoWallet>Connect a wallet to access the Continuity Engine.</NoWallet>
      </Wrapper>
    );
  }

  const basePath = entityId ? `/ssu/${entityId}` : "";
  const puzzleUrl = `${config.puzzleServiceUrl}${basePath}?player=${encodeURIComponent(address)}`;

  return (
    <Wrapper>
      <Frame src={puzzleUrl} title="Continuity Engine" allow="clipboard-write" />
    </Wrapper>
  );
}
