import { useState } from "react";
import styled from "styled-components";
import { ItemPickerModal } from "./ItemPickerModal";
import { useItems } from "../../hooks/useItems";

const Trigger = styled.button`
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
  cursor: pointer;
  text-align: left;
  margin-bottom: ${({ theme }) => theme.spacing.md};

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
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

const ItemName = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ItemTypeId = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
`;

interface Props {
  value: string;
  onChange: (typeId: string) => void;
}

export function ItemPickerField({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const { getItem } = useItems();

  const numericId = Number(value);
  const item = numericId ? getItem(numericId) : undefined;

  return (
    <>
      <Trigger type="button" onClick={() => setOpen(true)}>
        {item ? (
          <>
            <Icon src={`/${item.icon}`} alt={item.name} />
            <ItemName>{item.name}</ItemName>
            <ItemTypeId>{item.typeId}</ItemTypeId>
          </>
        ) : (
          <Placeholder>Select item…</Placeholder>
        )}
      </Trigger>
      {open && (
        <ItemPickerModal
          onSelect={(typeId) => onChange(String(typeId))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
