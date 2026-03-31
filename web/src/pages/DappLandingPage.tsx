import { useParams, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { config } from "../config";
import { SsuDeliveryDapp } from "./SsuDeliveryDapp";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const ActionBar = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  padding-bottom: 0;
`;

const ActionButton = styled.button`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
    background: ${({ theme }) => theme.colors.surface.overlay};
  }
`;

const ActionIcon = styled.span`
  font-size: 18px;
  line-height: 1;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DappLandingPage() {
  const { ssuId } = useParams<{ ssuId: string }>();
  const navigate = useNavigate();

  function handleCreateContract() {
    // Open the full contract creation form in a new tab — the dApp shell is
    // too narrow (550px) for the two-column layout.
    const url = `${config.webUiHost}/contracts/create`;
    window.open(url, "_blank", "noopener");
  }

  function handleContinuityEngine() {
    navigate(`/dapp/continuity/${ssuId ?? ""}`);
  }

  return (
    <>
      <ActionBar>
        <ActionButton onClick={handleCreateContract}>
          <ActionIcon>📝</ActionIcon>
          Create Contract
        </ActionButton>
        <ActionButton onClick={handleContinuityEngine}>
          <ActionIcon>🧠</ActionIcon>
          Continuity Engine
        </ActionButton>
      </ActionBar>
      <SsuDeliveryDapp />
    </>
  );
}
