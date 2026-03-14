import { useState } from "react";
import styled from "styled-components";
import { useAutoJoinTribe } from "../../hooks/useAutoJoinTribe";

const Banner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.primary.subtle};
  border-bottom: 1px solid ${({ theme }) => theme.colors.primary.main};
`;

const Message = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const TribeName = styled.strong`
  color: ${({ theme }) => theme.colors.primary.muted};
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-shrink: 0;
`;

const JoinButton = styled.button`
  background: ${({ theme }) => theme.colors.primary.main};
  color: ${({ theme }) => theme.colors.surface.bg};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.primary.hover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const DismissButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;

  &:hover {
    color: ${({ theme }) => theme.colors.text.secondary};
  }
`;

/**
 * Banner rendered at the top of the app when the user's in-game Character
 * belongs to a tribe that has an on-chain Tribe, but the user hasn't joined yet.
 */
export function AutoJoinBanner() {
  const { eligible, tribeName, isJoining, isLoading, join } = useAutoJoinTribe();
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed || isLoading) return null;

  const displayName = tribeName ?? "your in-game tribe";

  return (
    <Banner>
      <Message>
        Your character belongs to <TribeName>{displayName}</TribeName> — join the on-chain tribe to unlock tribe features.
      </Message>
      <Actions>
        <JoinButton onClick={join} disabled={isJoining}>
          {isJoining ? "Joining…" : "Join Tribe"}
        </JoinButton>
        <DismissButton onClick={() => setDismissed(true)} title="Dismiss">
          ×
        </DismissButton>
      </Actions>
    </Banner>
  );
}
