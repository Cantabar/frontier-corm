import styled from "styled-components";
import type { StructureState } from "../../lib/types";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: 5px 0;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.border};

  &:last-child {
    border-bottom: none;
  }
`;

const StructureName = styled.span`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ToggleGroup = styled.div`
  display: flex;
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  overflow: hidden;
  flex-shrink: 0;
`;

const ToggleBtn = styled.button<{ $active: boolean; $variant: StructureState }>`
  padding: 3px 6px;
  font-size: 10px;
  font-weight: 700;
  border: none;
  border-right: 1px solid ${({ theme }) => theme.colors.surface.border};
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  line-height: 1;

  &:last-child {
    border-right: none;
  }

  background: ${({ $active, $variant, theme }) => {
    if (!$active) return "transparent";
    switch ($variant) {
      case "missing": return "#7f2020";
      case "offline": return "#7a5c00";
      case "online":  return theme.colors.primary.main + "33";
    }
  }};

  color: ${({ $active, $variant, theme }) => {
    if (!$active) return theme.colors.text.muted;
    switch ($variant) {
      case "missing": return "#ff6b6b";
      case "offline": return "#ffc107";
      case "online":  return theme.colors.primary.main;
    }
  }};

  &:hover {
    background: ${({ $variant, theme }) => {
      switch ($variant) {
        case "missing": return "#7f202044";
        case "offline": return "#7a5c0044";
        case "online":  return theme.colors.primary.main + "22";
      }
    }};
    color: ${({ $variant, theme }) => {
      switch ($variant) {
        case "missing": return "#ff6b6b";
        case "offline": return "#ffc107";
        case "online":  return theme.colors.primary.main;
      }
    }};
  }
`;

const EmptyHint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  /** All unique facility types across loaded blueprints. */
  facilityTypes: Array<{ facilityTypeId: number; facilityName: string }>;
  /** Current effective state per facilityTypeId. */
  structureStates: Map<number, StructureState>;
  /** Called when the user toggles a structure state. */
  onStateChange: (facilityTypeId: number, state: StructureState) => void;
}

const STATES: StructureState[] = ["missing", "offline", "online"];

const STATE_LABEL: Record<StructureState, string> = {
  missing: "✗",
  offline: "○",
  online:  "●",
};

const STATE_TITLE: Record<StructureState, string> = {
  missing: "Does not exist",
  offline: "Exists but offline",
  online:  "Online",
};

export function StructureToggleList({ facilityTypes, structureStates, onStateChange }: Props) {
  if (facilityTypes.length === 0) {
    return <EmptyHint>No blueprint data loaded.</EmptyHint>;
  }

  return (
    <List>
      {facilityTypes.map(({ facilityTypeId, facilityName }) => {
        const current = structureStates.get(facilityTypeId) ?? "missing";
        return (
          <Row key={facilityTypeId}>
            <StructureName title={facilityName}>{facilityName}</StructureName>
            <ToggleGroup>
              {STATES.map((state) => (
                <ToggleBtn
                  key={state}
                  $active={current === state}
                  $variant={state}
                  title={STATE_TITLE[state]}
                  onClick={() => onStateChange(facilityTypeId, state)}
                >
                  {STATE_LABEL[state]}
                </ToggleBtn>
              ))}
            </ToggleGroup>
          </Row>
        );
      })}
    </List>
  );
}
