import styled from "styled-components";
import { useJobHistory } from "../../hooks/useJobs";
import { timeAgo } from "../../lib/format";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { EmptyState } from "../shared/EmptyState";
import { CharacterDisplay } from "../shared/CharacterDisplay";

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 13px;
`;

const EventName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.module.contractBoard};
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 12px;
`;

export function JobHistory({ tribeId }: { tribeId: string }) {
  const { data, isLoading } = useJobHistory(tribeId);

  if (isLoading) return <LoadingSpinner />;
  if (!data?.events?.length) {
    return <EmptyState title="No job history" />;
  }

  return (
    <List>
      {data.events.map((ev) => (
        <Row key={ev.id}>
          <div>
            <EventName>{ev.event_name.replace("Event", "")}</EventName>
            {ev.character_id && (
              <Meta> · <CharacterDisplay characterId={ev.character_id} showPortrait={false} /></Meta>
            )}
          </div>
          <Meta>{timeAgo(ev.timestamp_ms)}</Meta>
        </Row>
      ))}
    </List>
  );
}
