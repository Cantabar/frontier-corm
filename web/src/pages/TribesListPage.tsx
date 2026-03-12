import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useIdentity } from "../hooks/useIdentity";
import { useActiveTribe } from "../hooks/useActiveTribe";
import { useTribe } from "../hooks/useTribe";
import { CreateTribeModal } from "../components/tribe/CreateTribeModal";
import { EmptyState } from "../components/shared/EmptyState";
import type { TribeCapData } from "../lib/types";
import { formatAmount } from "../lib/format";

/* ------------------------------------------------------------------ */
/* Styled                                                              */
/* ------------------------------------------------------------------ */

const Page = styled.div`
  max-width: 960px;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const Button = styled.button`
  background: ${({ theme }) => theme.colors.primary.main};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.primary.hover};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
`;

const Card = styled.button<{ $active?: boolean }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary.main : theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const CardName = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CardMeta = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const RoleBadge = styled.span<{ $role: string }>`
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $role, theme }) =>
    $role === "Leader"
      ? theme.colors.primary.subtle
      : $role === "Officer"
        ? "#1a2a3a"
        : theme.colors.surface.overlay};
  color: ${({ $role, theme }) =>
    $role === "Leader"
      ? theme.colors.primary.main
      : $role === "Officer"
        ? "#4FC3F7"
        : theme.colors.text.muted};
`;

const ActiveTag = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.primary.main};
`;

/* ------------------------------------------------------------------ */
/* Tribe card (resolves name from chain)                               */
/* ------------------------------------------------------------------ */

function TribeCard({ cap, isActive }: { cap: TribeCapData; isActive: boolean }) {
  const { tribe } = useTribe(cap.tribeId);
  const { setActiveTribeId } = useActiveTribe();
  const navigate = useNavigate();

  function handleClick() {
    setActiveTribeId(cap.tribeId);
    navigate(`/tribe/${cap.tribeId}`);
  }

  return (
    <Card $active={isActive} onClick={handleClick}>
      <CardName>{tribe?.name ?? cap.tribeId.slice(0, 12) + "…"}</CardName>
      <CardMeta>
        {tribe ? `${tribe.memberCount} member${tribe.memberCount !== 1 ? "s" : ""}` : "Loading…"}
        {tribe && ` · Treasury ${formatAmount(tribe.treasuryBalance)} SUI`}
      </CardMeta>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RoleBadge $role={cap.role}>{cap.role}</RoleBadge>
        {isActive && <ActiveTag>Active</ActiveTag>}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function TribesListPage() {
  const { tribeCaps } = useIdentity();
  const { activeTribeId } = useActiveTribe();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <Page>
      <Header>
        <Title>My Tribes</Title>
        <Button onClick={() => setShowCreate(true)}>+ Create Tribe</Button>
      </Header>

      {tribeCaps.length === 0 ? (
        <EmptyState
          title="No tribe memberships"
          description="Create a new tribe or ask an existing tribe leader to add you."
        />
      ) : (
        <Grid>
          {tribeCaps.map((cap) => (
            <TribeCard
              key={cap.tribeId}
              cap={cap}
              isActive={cap.tribeId === activeTribeId}
            />
          ))}
        </Grid>
      )}

      {showCreate && <CreateTribeModal onClose={() => setShowCreate(false)} />}
    </Page>
  );
}
