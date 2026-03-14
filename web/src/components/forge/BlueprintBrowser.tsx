import { useState, useMemo } from "react";
import styled from "styled-components";
import type { BlueprintEntry } from "../../hooks/useBlueprints";
import { useItems } from "../../hooks/useItems";
import { BlueprintDetailModal } from "./BlueprintDetailModal";

// ── Tier color map (matches theme.colors.tier) ─────────────────

const TIER_COLOR: Record<string, string> = {
  Basic: "#666666",
  Standard: "#b0b0b0",
  Enhanced: "#4caf50",
  Prototype: "#42a5f5",
  Experimental: "#ab47bc",
  Exotic: "#ffd740",
};

// ── Styled components ──────────────────────────────────────────

const Section = styled.section`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: 0 0 ${({ theme }) => theme.spacing.md};
`;

const TabBar = styled.div`
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary.main : theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary.subtle : "transparent"};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary.main : theme.colors.text.secondary};
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const FiltersRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const GroupSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface.bg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Search = styled.input`
  flex: 1;
  min-width: 180px;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const CountBadge = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  white-space: nowrap;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  max-height: 480px;
  overflow-y: auto;
`;

const Card = styled.button<{ $tierColor?: string }>`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-left: 3px solid
    ${({ $tierColor, theme }) => $tierColor ?? theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;

  &:hover {
    border-right-color: ${({ theme }) => theme.colors.primary.main};
    border-top-color: ${({ theme }) => theme.colors.primary.main};
    border-bottom-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const CardIcon = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
  flex-shrink: 0;
`;

const CardBody = styled.div`
  flex: 1;
  min-width: 0;
`;

const CardName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CardGroup = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-top: 1px;
`;

const InputsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  flex-wrap: wrap;
`;

const InputChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const InputIcon = styled.img`
  width: 16px;
  height: 16px;
  object-fit: contain;
`;

const BadgeRow = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 4px;
`;

const TimeBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.muted};
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: 3px;
  padding: 0 4px;
`;

const MultiOutputBadge = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.module.forgePlanner};
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.module.forgePlanner};
  border-radius: 3px;
  padding: 0 4px;
`;

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 13px;
  grid-column: 1 / -1;
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

// ── Component ──────────────────────────────────────────────────

interface Props {
  blueprints: BlueprintEntry[];
  onResolve?: (outputTypeId: number) => void;
}

export function BlueprintBrowser({ blueprints, onResolve }: Props) {
  const { getItem } = useItems();

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedBp, setSelectedBp] = useState<BlueprintEntry | null>(null);

  // Unique categories from blueprints
  const categories = useMemo(
    () =>
      [
        ...new Set(
          blueprints.map((b) => b.primaryCategoryName).filter(Boolean),
        ),
      ] as string[],
    [blueprints],
  );

  // Groups within active category
  const groups = useMemo(() => {
    if (!activeCategory) return [];
    return [
      ...new Set(
        blueprints
          .filter((b) => b.primaryCategoryName === activeCategory)
          .map((b) => b.primaryGroupName)
          .filter(Boolean),
      ),
    ] as string[];
  }, [blueprints, activeCategory]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = blueprints;

    if (activeCategory) {
      list = list.filter((b) => b.primaryCategoryName === activeCategory);
      if (activeGroup) {
        list = list.filter((b) => b.primaryGroupName === activeGroup);
      }
    }

    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (b) =>
          b.primaryName.toLowerCase().includes(q) ||
          String(b.blueprintId).includes(q),
      );
    }

    return list;
  }, [blueprints, activeCategory, activeGroup, query]);

  function itemIconPath(typeId: number): string {
    return getItem(typeId)?.icon ?? "";
  }

  return (
    <Section>
      <SectionTitle>Blueprints</SectionTitle>

      {/* Category tabs */}
      <TabBar>
        <Tab
          $active={activeCategory === null}
          onClick={() => {
            setActiveCategory(null);
            setActiveGroup(null);
          }}
        >
          All
        </Tab>
        {categories.sort().map((cat) => (
          <Tab
            key={cat}
            $active={activeCategory === cat}
            onClick={() => {
              setActiveCategory(cat);
              setActiveGroup(null);
            }}
          >
            {cat}
          </Tab>
        ))}
      </TabBar>

      {/* Filters */}
      <FiltersRow>
        {activeCategory && groups.length > 1 && (
          <GroupSelect
            value={activeGroup ?? ""}
            onChange={(e) => setActiveGroup(e.target.value || null)}
          >
            <option value="">All {activeCategory}</option>
            {groups.sort().map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </GroupSelect>
        )}
        <Search
          placeholder="Search blueprints…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <CountBadge>{filtered.length} blueprints</CountBadge>
      </FiltersRow>

      {/* Grid */}
      <Grid>
        {filtered.length === 0 && <Empty>No blueprints found</Empty>}
        {filtered.map((bp) => {
          const tierColor = bp.primaryMetaGroupName
            ? TIER_COLOR[bp.primaryMetaGroupName]
            : undefined;

          return (
            <Card
              key={bp.blueprintId}
              $tierColor={tierColor}
              onClick={() => setSelectedBp(bp)}
            >
              {bp.primaryIcon && (
                <CardIcon src={`/${bp.primaryIcon}`} alt={bp.primaryName} loading="lazy" />
              )}
              <CardBody>
                <CardName>{bp.primaryName}</CardName>
                {bp.primaryGroupName && (
                  <CardGroup>{bp.primaryGroupName}</CardGroup>
                )}
                <InputsRow>
                  {bp.inputs.slice(0, 4).map((inp) => {
                    const icon = itemIconPath(inp.typeId);
                    return (
                      <InputChip key={inp.typeId}>
                        {icon && <InputIcon src={`/${icon}`} alt="" loading="lazy" />}
                        ×{inp.quantity}
                      </InputChip>
                    );
                  })}
                  {bp.inputs.length > 4 && (
                    <InputChip>+{bp.inputs.length - 4}</InputChip>
                  )}
                </InputsRow>
                <BadgeRow>
                  <TimeBadge>{bp.runTime}s</TimeBadge>
                  {bp.outputs.length > 1 && (
                    <MultiOutputBadge>
                      {bp.outputs.length} outputs
                    </MultiOutputBadge>
                  )}
                </BadgeRow>
              </CardBody>
            </Card>
          );
        })}
      </Grid>

      {/* Detail modal */}
      {selectedBp && (
        <BlueprintDetailModal
          blueprint={selectedBp}
          onClose={() => setSelectedBp(null)}
          onResolve={onResolve}
        />
      )}
    </Section>
  );
}
