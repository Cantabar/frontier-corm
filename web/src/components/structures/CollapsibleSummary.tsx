import { useState } from "react";
import styled from "styled-components";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollapsibleSummaryProps {
  totalCount: number;
  onlineCount: number;
  offlineCount: number;
  nodeCount: number;
  energyReserved: number;
  energyMax: number;
  cormEnabledCount: number;
  totalSsuCount: number;
}

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const SummaryHeader = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
`;

const SummaryTitle = styled.h3`
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const SummaryToggle = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
`;

const SummaryBody = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? "flex" : "none")};
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
`;

const SummaryCard = styled.div`
  padding: 16px;
`;

const CardLabel = styled.div`
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 4px;
`;

const CardValue = styled.div`
  font-size: 20px;
  font-weight: 700;
`;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = "frontier-corm:structures-summary-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CollapsibleSummary({
  totalCount,
  onlineCount,
  offlineCount,
  nodeCount,
  energyReserved,
  energyMax,
  cormEnabledCount,
  totalSsuCount,
}: CollapsibleSummaryProps) {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  }

  return (
    <div>
      <SummaryHeader>
        <SummaryTitle>Summary</SummaryTitle>
        <SummaryToggle
          aria-label="Toggle summary"
          onClick={handleToggle}
        >
          {collapsed ? "▸" : "▾"}
        </SummaryToggle>
      </SummaryHeader>
      <SummaryBody data-testid="summary-body" $open={!collapsed}>
        <SummaryCard>
          <CardLabel>Total</CardLabel>
          <CardValue>{totalCount}</CardValue>
        </SummaryCard>
        <SummaryCard>
          <CardLabel>Online</CardLabel>
          <CardValue>{onlineCount}</CardValue>
        </SummaryCard>
        <SummaryCard>
          <CardLabel>Offline</CardLabel>
          <CardValue>{offlineCount}</CardValue>
        </SummaryCard>
        <SummaryCard>
          <CardLabel>Nodes</CardLabel>
          <CardValue>{nodeCount}</CardValue>
        </SummaryCard>
        <SummaryCard>
          <CardLabel>Energy</CardLabel>
          <CardValue>
            {energyReserved} / {energyMax} GJ
          </CardValue>
        </SummaryCard>
        <SummaryCard>
          <CardLabel>CORM Enabled</CardLabel>
          <CardValue>
            {cormEnabledCount} / {totalSsuCount} SSUs
          </CardValue>
        </SummaryCard>
      </SummaryBody>
    </div>
  );
}
