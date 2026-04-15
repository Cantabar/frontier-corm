import { useMemo } from "react";
import styled from "styled-components";
import type { AssemblyData } from "../../lib/types";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Label = styled.span`
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Select = styled.select`
  width: 100%;
  padding: 6px 8px;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const StatusDot = styled.span<{ $online: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ $online, theme }) =>
    $online ? theme.colors.primary.main : theme.colors.text.muted};
  flex-shrink: 0;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  /** All owned structures — network nodes are filtered from this list. */
  structures: AssemblyData[];
  /** Currently selected network node ID, or null for "none". */
  selectedNodeId: string | null;
  /** Called when the user selects a different node (null = clear selection). */
  onSelect: (nodeId: string | null) => void;
  /** Whether the structures query is still loading. */
  isLoading: boolean;
  /** Whether a wallet is connected. */
  walletConnected: boolean;
}

export function NetworkNodeSelector({
  structures,
  selectedNodeId,
  onSelect,
  isLoading,
  walletConnected,
}: Props) {
  const networkNodes = useMemo(
    () => structures.filter((s) => s.moveType === "NetworkNode"),
    [structures],
  );

  const sortedNodes = useMemo(
    () => [...networkNodes].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)),
    [networkNodes],
  );

  const selectedNode = useMemo(
    () => sortedNodes.find((n) => n.id === selectedNodeId) ?? null,
    [sortedNodes, selectedNodeId],
  );

  if (!walletConnected) {
    return (
      <Wrapper>
        <Label>Network Node</Label>
        <Hint>Connect wallet to select a node.</Hint>
      </Wrapper>
    );
  }

  if (!isLoading && networkNodes.length === 0) {
    return (
      <Wrapper>
        <Label>Network Node</Label>
        <Hint>No network nodes found on-chain.</Hint>
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Label>Network Node</Label>
      <Select
        value={selectedNodeId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        disabled={isLoading}
      >
        <option value="">
          {isLoading ? "Loading\u2026" : "Select node\u2026"}
        </option>
        {sortedNodes.map((node) => (
          <option key={node.id} value={node.id}>
            {node.name || node.id.slice(0, 12) + "\u2026"}
          </option>
        ))}
      </Select>

      {selectedNode && (
        <StatusRow>
          <StatusDot $online={selectedNode.status === "Online"} />
          {selectedNode.status}
          {selectedNode.name && (
            <span style={{ marginLeft: 4, opacity: 0.6 }}>
              {selectedNode.id.slice(0, 8)}&hellip;
            </span>
          )}
        </StatusRow>
      )}
    </Wrapper>
  );
}
