import { useMemo, useState, useRef, useEffect } from "react";
import styled from "styled-components";
import { useSsuInventory, type InventoryItemEntry } from "../../hooks/useSsuInventory";
import { useItems } from "../../hooks/useItems";

// ── Styled components ──────────────────────────────────────────

const Wrapper = styled.div`
  position: relative;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Trigger = styled.button<{ $disabled?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  cursor: ${({ $disabled }) => ($disabled ? "not-allowed" : "pointer")};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  text-align: left;

  &:hover {
    border-color: ${({ $disabled, theme }) =>
      $disabled ? theme.colors.surface.border : theme.colors.primary.main};
  }
`;

const Placeholder = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Icon = styled.img`
  width: 24px;
  height: 24px;
  object-fit: contain;
  flex-shrink: 0;
`;

const IconPlaceholder = styled.div`
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ theme }) => theme.colors.surface.border};
  flex-shrink: 0;
`;

const ItemName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ItemMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
`;

const Dropdown = styled.div`
  position: absolute;
  z-index: 50;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: ${({ theme }) => theme.colors.surface.overlay};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  max-height: 260px;
  overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
`;

const DropdownItem = styled.button<{ $selected?: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ $selected, theme }) =>
    $selected ? theme.colors.primary.subtle : "transparent"};
  border: none;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.colors.surface.raised};
  }
`;

const Qty = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  flex-shrink: 0;
`;

const StatusText = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  text-align: center;
`;

// ── Component ──────────────────────────────────────────────────

interface Props {
  ssuId: string;
  ownerCapId: string;
  /** Currently selected value — compared against `String(entry.typeId)` */
  value: string;
  onChange: (entry: InventoryItemEntry) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function SsuItemPickerField({
  ssuId,
  ownerCapId,
  value,
  onChange,
  disabled,
  placeholder = "Select an item from this SSU…",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { getItem } = useItems();

  const enabled = !!ssuId && !!ownerCapId;
  const { slots, isLoading } = useSsuInventory(ssuId || undefined, ownerCapId || undefined, enabled);

  // Flatten all inventory slots into a single deduplicated list (sum quantities per typeId)
  const items = useMemo(() => {
    const map = new Map<number, InventoryItemEntry>();
    for (const slot of slots) {
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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selectedEntry = items.find((i) => String(i.typeId) === value);
  const selectedInfo = selectedEntry ? getItem(selectedEntry.typeId) : undefined;

  const isDisabled = disabled || !enabled;

  return (
    <Wrapper ref={wrapperRef}>
      <Trigger
        type="button"
        $disabled={isDisabled}
        onClick={() => {
          if (!isDisabled) setOpen((prev) => !prev);
        }}
      >
        {selectedEntry ? (
          <>
            {selectedInfo?.icon ? (
              <Icon src={`/${selectedInfo.icon}`} alt={selectedInfo.name} />
            ) : (
              <IconPlaceholder />
            )}
            <ItemName>{selectedInfo?.name ?? `Type ${selectedEntry.typeId}`}</ItemName>
            <ItemMeta>×{selectedEntry.quantity.toLocaleString()}</ItemMeta>
          </>
        ) : (
          <Placeholder>{!enabled ? "Select an SSU first" : placeholder}</Placeholder>
        )}
      </Trigger>

      {open && (
        <Dropdown>
          {isLoading ? (
            <StatusText>Loading inventory…</StatusText>
          ) : items.length === 0 ? (
            <StatusText>No items in this SSU</StatusText>
          ) : (
            items.map((entry) => {
              const info = getItem(entry.typeId);
              return (
                <DropdownItem
                  key={entry.typeId}
                  $selected={String(entry.typeId) === value}
                  onClick={() => {
                    onChange(entry);
                    setOpen(false);
                  }}
                >
                  {info?.icon ? (
                    <Icon src={`/${info.icon}`} alt={info.name} />
                  ) : (
                    <IconPlaceholder />
                  )}
                  <ItemName>{info?.name ?? `Type ${entry.typeId}`}</ItemName>
                  <Qty>×{entry.quantity.toLocaleString()}</Qty>
                </DropdownItem>
              );
            })
          )}
        </Dropdown>
      )}
    </Wrapper>
  );
}
