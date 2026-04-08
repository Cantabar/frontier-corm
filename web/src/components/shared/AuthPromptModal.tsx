/**
 * Confirmation modal shown before triggering a wallet signing prompt.
 *
 * Explains to the user what is about to happen (a no-op transaction
 * signature for identity verification) and why, so the subsequent
 * wallet popup is not unexpected.
 */

import styled from "styled-components";
import { PrimaryButton, SecondaryButton } from "./Button";

// ============================================================
// Styled primitives
// ============================================================

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const Box = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing.xl};
  max-width: 480px;
  width: 90%;
`;

const Title = styled.h3`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary.main};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Text = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  line-height: 1.5;
`;

const Detail = styled.p`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  line-height: 1.5;
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;
`;

// ============================================================
// Context-specific copy
// ============================================================

const COPY = {
  structures: {
    title: "Verify Identity",
    text: "To display location data for your structures, we need to verify your wallet identity with the Shadow Location Network.",
  },
  locations: {
    title: "Connect to Location Network",
    text: "To access the Shadow Location Network — where encrypted structure locations are managed — we need to verify your wallet identity.",
  },
} as const;

// ============================================================
// Component
// ============================================================

interface Props {
  context: "structures" | "locations";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AuthPromptModal({ context, loading, onConfirm, onCancel }: Props) {
  const copy = COPY[context];

  return (
    <Overlay onClick={loading ? undefined : onCancel}>
      <Box onClick={(e) => e.stopPropagation()}>
        <Title>{copy.title}</Title>
        <Text>{copy.text}</Text>
        <Detail>
          Your wallet will prompt you to sign a small transaction. This is used
          solely for authentication — no funds are transferred and no on-chain
          state is changed.
        </Detail>
        <Actions>
          <SecondaryButton onClick={onCancel} disabled={loading}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={onConfirm} disabled={loading}>
            {loading ? "Verifying…" : "Verify Identity"}
          </PrimaryButton>
        </Actions>
      </Box>
    </Overlay>
  );
}
