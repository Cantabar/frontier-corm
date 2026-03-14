import { useState, useMemo } from "react";
import styled from "styled-components";
import { Modal } from "./Modal";
import { useItems, type ItemEntry } from "../../hooks/useItems";

const Search = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
  max-height: 400px;
  overflow-y: auto;
`;

const Card = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Icon = styled.img`
  width: 48px;
  height: 48px;
  object-fit: contain;
`;

const Name = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  text-align: center;
  line-height: 1.2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const TypeId = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const Empty = styled.p`
  text-align: center;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 13px;
  grid-column: 1 / -1;
  padding: ${({ theme }) => theme.spacing.lg} 0;
`;

interface Props {
  onSelect: (typeId: number) => void;
  onClose: () => void;
}

export function ItemPickerModal({ onSelect, onClose }: Props) {
  const { items } = useItems();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        String(item.typeId).includes(q),
    );
  }, [items, query]);

  function handleSelect(item: ItemEntry) {
    onSelect(item.typeId);
    onClose();
  }

  return (
    <Modal title="Select Item" onClose={onClose}>
      <Search
        placeholder="Search items…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <Grid>
        {filtered.length === 0 && <Empty>No items found</Empty>}
        {filtered.map((item) => (
          <Card key={item.typeId} onClick={() => handleSelect(item)}>
            <Icon src={`/${item.icon}`} alt={item.name} loading="lazy" />
            <Name>{item.name}</Name>
            <TypeId>{item.typeId}</TypeId>
          </Card>
        ))}
      </Grid>
    </Modal>
  );
}
