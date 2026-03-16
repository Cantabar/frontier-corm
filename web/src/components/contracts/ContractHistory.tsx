import styled from "styled-components";
import { useContractHistory } from "../../hooks/useContracts";
import { timeAgo } from "../../lib/format";
import { CopyableId } from "../shared/CopyableId";
import { StatusBadge } from "../shared/StatusBadge";
import { EmptyState } from "../shared/EmptyState";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { CharacterDisplay } from "../shared/CharacterDisplay";

const Table = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: ${({ theme }) => theme.colors.surface.border};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 120px 120px 100px;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface.raised};
  align-items: center;
`;

const HeaderRow = styled(Row)`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.text.muted};
  background: ${({ theme }) => theme.colors.surface.overlay};
`;

const Cell = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

function eventStatusVariant(name: string): "completed" | "cancelled" | "expired" {
  if (name.includes("Cancelled")) return "cancelled";
  if (name.includes("Expired")) return "expired";
  return "completed";
}

export function ContractHistory() {
  const { data, isLoading } = useContractHistory({ limit: 25 });
  const events = data?.events ?? [];

  if (isLoading) return <LoadingSpinner />;
  if (events.length === 0) return <EmptyState title="No contract history yet" />;

  return (
    <Table>
      <HeaderRow>
        <div>Contract</div>
        <div>Event</div>
        <div>Character</div>
        <div>Time</div>
      </HeaderRow>
      {events.map((ev) => (
        <Row key={ev.id}>
          <Cell>{ev.primary_id ? <CopyableId id={ev.primary_id} /> : "—"}</Cell>
          <Cell>
            <StatusBadge status={eventStatusVariant(ev.event_name)} />
          </Cell>
          <Cell>{ev.character_id ? <CharacterDisplay characterId={ev.character_id} showPortrait={false} /> : "—"}</Cell>
          <Cell>{timeAgo(ev.timestamp_ms)}</Cell>
        </Row>
      ))}
    </Table>
  );
}
