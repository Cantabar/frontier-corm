import { useState, useRef, useEffect } from "react";
import styled from "styled-components";
import { useIdentity } from "../../hooks/useIdentity";
import { useActiveTribe } from "../../hooks/useActiveTribe";
import { useTribe } from "../../hooks/useTribe";
import { CreateTribeModal } from "./CreateTribeModal";

/* ------------------------------------------------------------------ */
/* Styled                                                              */
/* ------------------------------------------------------------------ */

const Wrapper = styled.div`
  position: relative;
`;

const Trigger = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface.overlay};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Caret = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Dropdown = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 220px;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.md};
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 100;
  padding: ${({ theme }) => theme.spacing.xs} 0;
`;

const Option = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.surface.overlay : "transparent"};
  border: none;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary.main : theme.colors.text.secondary};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.overlay};
  }
`;

const RoleBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Divider = styled.hr`
  border: none;
  border-top: 1px solid ${({ theme }) => theme.colors.surface.border};
  margin: ${({ theme }) => theme.spacing.xs} 0;
`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Tiny component that resolves a tribe ID to its name. */
function TribeName({ tribeId }: { tribeId: string }) {
  const { tribe } = useTribe(tribeId);
  return <>{tribe?.name ?? tribeId.slice(0, 8) + "…"}</>;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function TribeSelector() {
  const { tribeCaps } = useIdentity();
  const { activeTribeId, setActiveTribeId } = useActiveTribe();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (tribeCaps.length === 0) {
    return (
      <>
        <Trigger onClick={() => setShowCreate(true)}>+ Create Tribe</Trigger>
        {showCreate && <CreateTribeModal onClose={() => setShowCreate(false)} />}
      </>
    );
  }

  return (
    <Wrapper ref={ref}>
      <Trigger onClick={() => setOpen((o) => !o)}>
        {activeTribeId ? <TribeName tribeId={activeTribeId} /> : "Select Tribe"}
        <Caret>▾</Caret>
      </Trigger>

      {open && (
        <Dropdown>
          {tribeCaps.map((cap) => (
            <Option
              key={cap.tribeId}
              $active={cap.tribeId === activeTribeId}
              onClick={() => {
                setActiveTribeId(cap.tribeId);
                setOpen(false);
              }}
            >
              <TribeName tribeId={cap.tribeId} />
              <RoleBadge>{cap.role}</RoleBadge>
            </Option>
          ))}
          <Divider />
          <Option
            onClick={() => {
              setOpen(false);
              setShowCreate(true);
            }}
          >
            + Create Tribe
          </Option>
        </Dropdown>
      )}

      {showCreate && <CreateTribeModal onClose={() => setShowCreate(false)} />}
    </Wrapper>
  );
}
