/**
 * Visual progress panel for multi-transaction bulk contract creation.
 *
 * Shows one card per transaction batch with its status and the item names
 * being created in that batch.
 */

import styled, { keyframes } from "styled-components";
import type { BulkItemPayload } from "../../lib/bulkItemForCoin";

// ── Types ──────────────────────────────────────────────────────

export type BatchStatus = "pending" | "preparing" | "signing" | "confirming" | "succeeded" | "failed";

export interface BatchState {
  items: BulkItemPayload[];
  status: BatchStatus;
  error?: string;
}

// ── Styled components ──────────────────────────────────────────

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.md};
`;

const SummaryBanner = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.primary.subtle};
  border: 1px solid ${({ theme }) => theme.colors.primary.main}33;
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
`;

const Card = styled.div<{ $status: BatchStatus }>`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.radii.sm};
  border: 1px solid
    ${({ $status, theme }) =>
      $status === "succeeded"
        ? theme.colors.success
        : $status === "failed"
          ? theme.colors.danger
          : $status === "pending"
            ? theme.colors.surface.border
            : theme.colors.primary.main};
  background: ${({ $status, theme }) =>
    $status === "succeeded"
      ? theme.colors.success + "11"
      : $status === "failed"
        ? theme.colors.danger + "11"
        : theme.colors.surface.bg};
  animation: ${({ $status }) =>
    $status === "preparing" || $status === "signing" || $status === "confirming"
      ? pulse
      : "none"} 1.2s ease-in-out infinite;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TxLabel = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const StatusBadge = styled.span<{ $status: BatchStatus }>`
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
  background: ${({ $status, theme }) =>
    $status === "succeeded"
      ? theme.colors.success
      : $status === "failed"
        ? theme.colors.danger
        : $status === "pending"
          ? theme.colors.surface.border
          : theme.colors.primary.main};
  color: ${({ $status }) => ($status === "pending" ? "#999" : "#fff")};
`;

const ItemList = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  line-height: 1.4;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.danger};
  margin-top: 2px;
  word-break: break-word;
`;

// ── Status labels ──────────────────────────────────────────────

const STATUS_LABELS: Record<BatchStatus, string> = {
  pending: "Pending",
  preparing: "Preparing…",
  signing: "Awaiting signature…",
  confirming: "Confirming…",
  succeeded: "Succeeded",
  failed: "Failed",
};

// ── Component ──────────────────────────────────────────────────

interface Props {
  batches: BatchState[];
  totalContracts: number;
}

export function BatchProgressPanel({ batches, totalContracts }: Props) {
  const txCount = batches.length;
  const succeededCount = batches.filter((b) => b.status === "succeeded").length;
  const failedCount = batches.filter((b) => b.status === "failed").length;
  const successContracts = batches
    .filter((b) => b.status === "succeeded")
    .reduce((sum, b) => sum + b.items.length, 0);

  return (
    <Wrapper>
      <SummaryBanner>
        Creating {totalContracts} contract{totalContracts !== 1 ? "s" : ""} in {txCount} transaction
        {txCount !== 1 ? "s" : ""}
        {succeededCount > 0 && ` — ${successContracts} created`}
        {failedCount > 0 && ` — ${failedCount} failed`}
      </SummaryBanner>

      {batches.map((batch, i) => (
        <Card key={i} $status={batch.status}>
          <CardHeader>
            <TxLabel>
              Transaction {i + 1} of {txCount}
            </TxLabel>
            <StatusBadge $status={batch.status}>{STATUS_LABELS[batch.status]}</StatusBadge>
          </CardHeader>
          <ItemList>
            {batch.items.map((item) => item.itemName).join(", ")}
            {" "}({batch.items.length} contract{batch.items.length !== 1 ? "s" : ""})
          </ItemList>
          {batch.error && <ErrorText>{batch.error}</ErrorText>}
        </Card>
      ))}
    </Wrapper>
  );
}
