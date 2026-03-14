import styled from "styled-components";
import type { JobPostingData } from "../../lib/types";
import { formatAmount, formatDeadline } from "../../lib/format";
import { StatusBadge } from "../shared/StatusBadge";
import { CharacterDisplay } from "../shared/CharacterDisplay";

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.surface.borderHover};
  }
`;

const TopRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Description = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Meta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Reward = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary.muted};
`;

const CompletionTag = styled.span`
  display: inline-block;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface.overlay};
  color: ${({ theme }) => theme.colors.text.muted};
`;

function completionLabel(ct: JobPostingData["completionType"]): string {
  return ct.variant;
}

interface Props {
  job: JobPostingData;
  onClick?: () => void;
}

export function JobCard({ job, onClick }: Props) {
  return (
    <Card onClick={onClick}>
      <TopRow>
        <CompletionTag>{completionLabel(job.completionType)}</CompletionTag>
        <StatusBadge status={job.status.toLowerCase() as "open" | "assigned" | "disputed"} />
      </TopRow>
      <Description>{job.description}</Description>
      <Meta>
        <Reward>{formatAmount(job.rewardAmount)} SUI</Reward>
        <span>Poster: <CharacterDisplay characterId={job.posterId} showPortrait={false} /></span>
        <span>{formatDeadline(job.deadlineMs)}</span>
        {job.minReputation > 0 && <span>Min rep: {job.minReputation}</span>}
      </Meta>
    </Card>
  );
}
