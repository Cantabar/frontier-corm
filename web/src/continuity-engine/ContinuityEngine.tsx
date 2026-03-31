/**
 * Continuity Engine — iframe wrapper for the continuity-engine service.
 *
 * Embeds the Go/HTMX continuity-engine service as a full-height iframe,
 * passing the connected wallet's address as the `player` query param so
 * the service can identify the player.
 *
 * Renders a `CormStateBar` above the iframe showing canonical on-chain
 * corm state (phase, stability, corruption). A postMessage bridge
 * (`useCormStateBridge`) forwards state changes into the iframe so the
 * puzzle-service can optionally reconcile.
 */

import { useRef } from "react";
import styled from "styled-components";
import { useSearchParams } from "react-router-dom";
import { useIdentity } from "../hooks/useIdentity";
import { useInstalledCorms } from "../hooks/useInstalledCorms";
import { config } from "../config";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { CormStateBar } from "./CormStateBar";
import { useCormStateBridge } from "./useCormStateBridge";

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
  const { address, characterId, inGameTribeId, isLoading } = useIdentity();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [searchParams] = useSearchParams();
  const { installedCorms } = useInstalledCorms();

  // Resolve corm state ID and network node from URL params or first installed corm
  const urlCormStateId = searchParams.get("cormStateId") || undefined;
  const urlNodeId = searchParams.get("node") || undefined;
  const activeCormStateId = urlCormStateId || installedCorms[0]?.cormStateId || config.cormStateId || undefined;
  const activeNodeId = urlNodeId || installedCorms[0]?.networkNodeId || undefined;

  // Bridge on-chain state into the continuity-engine iframe
  useCormStateBridge(iframeRef, activeCormStateId);

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

  let puzzleUrl = `${config.continuityEngineUrl}?player=${encodeURIComponent(address)}`;
  if (activeNodeId) {
    puzzleUrl += `&node=${encodeURIComponent(activeNodeId)}`;
  }
  if (activeCormStateId) {
    puzzleUrl += `&cormStateId=${encodeURIComponent(activeCormStateId)}`;
  }
  if (characterId) {
    puzzleUrl += `&characterId=${encodeURIComponent(characterId)}`;
  }
  if (inGameTribeId && inGameTribeId > 0) {
    puzzleUrl += `&tribeId=${encodeURIComponent(inGameTribeId)}`;
  }

  return (
    <Wrapper>
      <CormStateBar objectId={activeCormStateId} />
      <Frame ref={iframeRef} src={puzzleUrl} title="Continuity Engine" allow="clipboard-write" />
    </Wrapper>
  );
}

/**
 * Dapp variant — used in the SSU iframe shell (/dapp/continuity/:entityId).
 * Includes the entity_id in the puzzle-service URL path.
 */
export function ContinuityEngineDapp({ entityId }: { entityId?: string }) {
  const { address, characterId, inGameTribeId, isLoading } = useIdentity();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { installedCorms } = useInstalledCorms();

  // For SSU context the entity_id is the network node; for browser, fall back to first installed
  const activeNodeId = entityId || installedCorms[0]?.networkNodeId || undefined;
  const activeCormStateId = installedCorms.find((c) => c.networkNodeId === activeNodeId)?.cormStateId
    || installedCorms[0]?.cormStateId
    || config.cormStateId
    || undefined;

  // Bridge on-chain state into the continuity-engine iframe
  useCormStateBridge(iframeRef, activeCormStateId);

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
  let puzzleUrl = `${config.continuityEngineUrl}${basePath}?player=${encodeURIComponent(address)}`;
  if (activeNodeId) {
    puzzleUrl += `&node=${encodeURIComponent(activeNodeId)}`;
  }
  if (activeCormStateId) {
    puzzleUrl += `&cormStateId=${encodeURIComponent(activeCormStateId)}`;
  }
  if (characterId) {
    puzzleUrl += `&characterId=${encodeURIComponent(characterId)}`;
  }
  if (inGameTribeId && inGameTribeId > 0) {
    puzzleUrl += `&tribeId=${encodeURIComponent(inGameTribeId)}`;
  }

  return (
    <Wrapper>
      <CormStateBar objectId={activeCormStateId} />
      <Frame ref={iframeRef} src={puzzleUrl} title="Continuity Engine" allow="clipboard-write" />
    </Wrapper>
  );
}
