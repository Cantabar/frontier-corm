import styled, { keyframes } from "styled-components";
import { useQuery } from "@tanstack/react-query";
import { getEventProof } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { CopyableId } from "../shared/CopyableId";
import { LoadingSpinner } from "../shared/LoadingSpinner";

const slideDown = keyframes`
  from { opacity: 0; max-height: 0; }
  to   { opacity: 1; max-height: 500px; }
`;

const Wrapper = styled.div<{ $accentColor: string }>`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.borderHover};
  border-top: none;
  border-radius: 0 0 ${({ theme }) => theme.radii.sm} ${({ theme }) => theme.radii.sm};
  border-left: 3px solid ${({ $accentColor }) => $accentColor};
  padding: ${({ theme }) => theme.spacing.lg};
  overflow: hidden;
  animation: ${slideDown} 0.2s ease-out;
`;

const Title = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Field = styled.div`
  display: flex;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.xs} 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.border};
  font-size: 13px;
`;

const FieldLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

const FieldValue = styled.code`
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
`;

const Note = styled.div`
  margin-top: ${({ theme }) => theme.spacing.sm};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  font-style: italic;
`;

const DataBlock = styled.pre`
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  overflow-x: auto;
  margin-top: ${({ theme }) => theme.spacing.sm};
  max-height: 200px;
`;

interface Props {
  eventId: number;
  accentColor?: string;
  onClose: () => void;
}

export function ProofViewer({ eventId, accentColor = "#78909C", onClose }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["proof", eventId],
    queryFn: () => getEventProof(eventId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !data) return null;

  return (
    <Wrapper $accentColor={accentColor}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title>On-Chain Proof</Title>
        <button
          onClick={onClose}
style={{ background: "none", border: "none", color: "#78909C", cursor: "pointer", fontSize: 18 }}
        >
          &times;
        </button>
      </div>

      <Field>
        <FieldLabel>Event</FieldLabel>
        <FieldValue>{data.event_name}</FieldValue>
      </Field>
      <Field>
        <FieldLabel>Tx Digest</FieldLabel>
        <FieldValue><CopyableId id={data.proof.tx_digest} startLen={10} endLen={6} /></FieldValue>
      </Field>
      <Field>
        <FieldLabel>Event Seq</FieldLabel>
        <FieldValue>{data.proof.event_seq}</FieldValue>
      </Field>
      <Field>
        <FieldLabel>Checkpoint</FieldLabel>
        <FieldValue>{data.proof.checkpoint_seq ?? "—"}</FieldValue>
      </Field>
      <Field>
        <FieldLabel>Timestamp</FieldLabel>
        <FieldValue>{timeAgo(data.proof.timestamp_ms)}</FieldValue>
      </Field>

      <Note>{data.proof.verification_note}</Note>

      <DataBlock>{JSON.stringify(data.event_data, null, 2)}</DataBlock>
    </Wrapper>
  );
}
