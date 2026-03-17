import { useState, useMemo } from "react";
import styled from "styled-components";
import { useSsuInventory, type InventoryItemEntry } from "../../hooks/useSsuInventory";
import { useItems } from "../../hooks/useItems";

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
  width: 560px;
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
  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

const Search = styled.input`
  width: 100%;
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

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
`;

const Row = styled.button<{ $selected?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary.subtle : "transparent"};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
`;

const Checkbox = styled.span<{ $checked: boolean }>`
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1.5px solid
    ${({ $checked, theme }) =>
      $checked ? theme.colors.primary.main : theme.colors.surface.border};
  background: ${({ $checked, theme }) =>
    $checked ? theme.colors.primary.main : "transparent"};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 11px;
  color: #fff;
  line-height: 1;
`;

const Icon = styled.img`
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
`;

const IconPlaceholder = styled.div`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface.border};
  flex-shrink: 0;
`;

const ItemName = styled.span`
  flex: 1;
  line-height: 1.3;
  word-break: break-word;
`;

const ItemMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
  white-space: nowrap;
`;

const Qty = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  flex-shrink: 0;
`;

const StatusText = styled.div`
  padding: ${({ theme }) => theme.spacing.lg};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const SelectedCount = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const ConfirmBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.primary.main};
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// ── Component ──────────────────────────────────────────────────

interface Props {
  ssuId: string;
  ownerCapId: string;
  /** Type IDs already selected (pre-checked). */
  alreadySelected: Set<number>;
  onConfirm: (entries: InventoryItemEntry[]) => void;
  onClose: () => void;
}

export function SsuMultiItemPickerModal({
  ssuId,
  ownerCapId,
  alreadySelected,
  onConfirm,
  onClose,
}: Props) {
  const { getItem } = useItems();
  const { slots, isLoading } = useSsuInventory(ssuId || undefined, ownerCapId || undefined, !!ssuId && !!ownerCapId);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(() => new Set(alreadySelected));

  // Deduplicate inventory entries (sum quantities per typeId), owner only
  const items = useMemo(() => {
    const map = new Map<number, InventoryItemEntry>();
    const ownerSlots = slots.filter((s) => s.kind === "owner");
    for (const slot of ownerSlots) {
      for (const entry of slot.items) {
        const existing = map.get(entry.typeId);
        if (existing) {
          map.set(entry.typeId, { ...existing, quantity: existing.quantity + entry.quantity });
        } else {
          map.set(entry.typeId, { ...entry });
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      const aName = getItem(a.typeId)?.name ?? "";
      const bName = getItem(b.typeId)?.name ?? "";
      return aName.localeCompare(bName);
    });
  }, [slots, getItem]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter((entry) => {
      const info = getItem(entry.typeId);
      const name = info?.name?.toLowerCase() ?? "";
      return name.includes(q) || String(entry.typeId).includes(q);
    });
  }, [items, query, getItem]);

  function toggleItem(typeId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  function handleConfirm() {
    const entries = items.filter((e) => selected.has(e.typeId));
    onConfirm(entries);
    onClose();
  }

  return (
    <Overlay onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Panel>
        <Header>
          <Title>Select Items</Title>
          <CloseBtn onClick={onClose}>&times;</CloseBtn>
        </Header>

        <Search
          placeholder="Search by name or type ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <List>
          {isLoading ? (
            <StatusText>Loading inventory…</StatusText>
          ) : filtered.length === 0 ? (
            <StatusText>{items.length === 0 ? "No items in this SSU" : "No matching items"}</StatusText>
          ) : (
            filtered.map((entry) => {
              const info = getItem(entry.typeId);
              const checked = selected.has(entry.typeId);
              return (
                <Row
                  key={entry.typeId}
                  $selected={checked}
                  onClick={() => toggleItem(entry.typeId)}
                >
                  <Checkbox $checked={checked}>{checked ? "✓" : ""}</Checkbox>
                  {info?.icon ? (
                    <Icon src={`/${info.icon}`} alt={info.name} />
                  ) : (
                    <IconPlaceholder />
                  )}
                  <ItemName>{info?.name ?? `Type ${entry.typeId}`}</ItemName>
                  <ItemMeta>#{entry.typeId}</ItemMeta>
                  <Qty>×{entry.quantity.toLocaleString()}</Qty>
                </Row>
              );
            })
          )}
        </List>

        <Footer>
          <SelectedCount>{selected.size} item{selected.size !== 1 ? "s" : ""} selected</SelectedCount>
          <ConfirmBtn onClick={handleConfirm} disabled={selected.size === 0}>
            Add Selected
          </ConfirmBtn>
        </Footer>
      </Panel>
    </Overlay>
  );
}
