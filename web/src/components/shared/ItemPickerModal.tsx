import { useState, useMemo } from "react";
import styled from "styled-components";
import { useItems, type ItemEntry } from "../../hooks/useItems";

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

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.surface.overlay};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.lg};
  padding: ${({ theme }) => theme.spacing.lg};
  width: 720px;
  max-width: 95vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h2`
  font-size: 18px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 20px;
  line-height: 1;
  padding: ${({ theme }) => theme.spacing.xs};
  cursor: pointer;
  &:hover { color: ${({ theme }) => theme.colors.text.primary}; }
`;

// ── Category tab bar ───────────────────────────────────────────

const TabBar = styled.div`
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 4px 10px;
  border: 1px solid ${({ $active, theme }) =>
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

// ── Group selector ─────────────────────────────────────────────

const GroupSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface.bg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 12px;
  cursor: pointer;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary.main}; }
`;

// ── Filter controls row ────────────────────────────────────────

const FiltersRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
  align-items: center;
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

const ChipFamily = styled.div`
  display: flex;
  align-items: center;
  gap: 3px;
`;

const ChipLabel = styled.span`
  font-size: 10px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

const Chip = styled.button<{ $active: boolean }>`
  padding: 2px 8px;
  border: 1px solid ${({ $active, theme }) =>
    $active ? theme.colors.primary.main : theme.colors.surface.border};
  border-radius: 10px;
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary.main : "transparent"};
  color: ${({ $active }) => ($active ? "#0F1318" : "#B0BEC5")};
  font-size: 11px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  transition: all 0.12s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary.main}; }
`;

// ── Item grid ──────────────────────────────────────────────────

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  overflow-y: auto;
  flex: 1;
`;

const Card = styled.button<{ $tierColor?: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-left: 3px solid ${({ $tierColor, theme }) =>
    $tierColor ?? theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  transition: border-color 0.15s;
  &:hover {
    border-right-color: ${({ theme }) => theme.colors.primary.main};
    border-top-color: ${({ theme }) => theme.colors.primary.main};
    border-bottom-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Icon = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
`;

const ItemName = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const GroupName = styled.span`
  font-size: 9px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
`;

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 13px;
  grid-column: 1 / -1;
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

// ── Tag filter definitions ─────────────────────────────────────

const SLOT_TAGS = [
  { tag: "high_slot", label: "High" },
  { tag: "mid_slot", label: "Mid" },
  { tag: "low_slot", label: "Low" },
  { tag: "engine_slot", label: "Engine" },
] as const;

const SIZE_TAGS = [
  { tag: "small_size", label: "S" },
  { tag: "medium_size", label: "M" },
  { tag: "large_size", label: "L" },
] as const;

// ── Component ──────────────────────────────────────────────────

interface Props {
  onSelect: (typeId: number) => void;
  onClose: () => void;
}

export function ItemPickerModal({ onSelect, onClose }: Props) {
  const { items } = useItems();

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activeSlots, setActiveSlots] = useState<Set<string>>(new Set());
  const [activeSizes, setActiveSizes] = useState<Set<string>>(new Set());

  // Derive unique categories from items
  const categories = useMemo(
    () => [...new Set(items.map((i) => i.categoryName).filter(Boolean))] as string[],
    [items],
  );

  // Derive groups for active category
  const groups = useMemo(() => {
    if (!activeCategory) return [];
    return [
      ...new Set(
        items
          .filter((i) => i.categoryName === activeCategory)
          .map((i) => i.groupName)
          .filter(Boolean),
      ),
    ] as string[];
  }, [items, activeCategory]);

  // Apply all filters
  const filtered = useMemo(() => {
    let list = items;

    if (activeCategory) {
      list = list.filter((i) => i.categoryName === activeCategory);
      if (activeGroup) {
        list = list.filter((i) => i.groupName === activeGroup);
      }
    }

    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (i) => i.name.toLowerCase().includes(q) || String(i.typeId).includes(q),
      );
    }

    if (activeSlots.size > 0) {
      list = list.filter((i) => i.tags.some((t) => activeSlots.has(t)));
    }
    if (activeSizes.size > 0) {
      list = list.filter((i) => i.tags.some((t) => activeSizes.has(t)));
    }

    return list;
  }, [items, activeCategory, activeGroup, query, activeSlots, activeSizes]);

  function handleSelect(item: ItemEntry) {
    onSelect(item.typeId);
    onClose();
  }

  function toggleTag(set: Set<string>, setFn: React.Dispatch<React.SetStateAction<Set<string>>>, tag: string) {
    setFn((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <Overlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Panel>
        <Header>
          <Title>Select Item</Title>
          <CloseBtn onClick={onClose}>&times;</CloseBtn>
        </Header>

        {/* Category tabs */}
        <TabBar>
          <Tab $active={activeCategory === null} onClick={() => { setActiveCategory(null); setActiveGroup(null); }}>
            All
          </Tab>
          {categories.sort().map((cat) => (
            <Tab
              key={cat}
              $active={activeCategory === cat}
              onClick={() => { setActiveCategory(cat); setActiveGroup(null); }}
            >
              {cat}
            </Tab>
          ))}
        </TabBar>

        {/* Filters row: group dropdown + search + chips */}
        <FiltersRow>
          {activeCategory && groups.length > 1 && (
            <GroupSelect
              value={activeGroup ?? ""}
              onChange={(e) => setActiveGroup(e.target.value || null)}
            >
              <option value="">All {activeCategory}</option>
              {groups.sort().map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </GroupSelect>
          )}

          <Search
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <ChipFamily>
            <ChipLabel>Slot:</ChipLabel>
            {SLOT_TAGS.map(({ tag, label }) => (
              <Chip key={tag} $active={activeSlots.has(tag)} onClick={() => toggleTag(activeSlots, setActiveSlots, tag)}>
                {label}
              </Chip>
            ))}
          </ChipFamily>

          <ChipFamily>
            <ChipLabel>Size:</ChipLabel>
            {SIZE_TAGS.map(({ tag, label }) => (
              <Chip key={tag} $active={activeSizes.has(tag)} onClick={() => toggleTag(activeSizes, setActiveSizes, tag)}>
                {label}
              </Chip>
            ))}
          </ChipFamily>
        </FiltersRow>

        {/* Item grid */}
        <Grid>
          {filtered.length === 0 && <Empty>No items found</Empty>}
          {filtered.map((item) => (
            <Card
              key={item.typeId}
              $tierColor={item.metaGroupName ? TIER_COLOR[item.metaGroupName] : undefined}
              onClick={() => handleSelect(item)}
            >
              <Icon src={`/${item.icon}`} alt={item.name} loading="lazy" />
              <ItemName>{item.name}</ItemName>
              {item.groupName && <GroupName>{item.groupName}</GroupName>}
            </Card>
          ))}
        </Grid>
      </Panel>
    </Overlay>
  );
}
