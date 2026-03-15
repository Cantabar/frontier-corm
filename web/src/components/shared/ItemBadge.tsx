import styled from "styled-components";
import { useItems } from "../../hooks/useItems";

const Wrapper = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  vertical-align: middle;
`;

const Icon = styled.img`
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
`;

const IconPlaceholder = styled.span`
  display: inline-block;
  width: 20px;
  height: 20px;
  border-radius: 2px;
  background: ${({ theme }) => theme.colors.surface.border};
  flex-shrink: 0;
`;

const Name = styled.span`
  font-weight: 600;
  white-space: nowrap;
`;

const Qty = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

interface Props {
  typeId: number;
  /** When provided, renders "×{quantity}" after the name. */
  showQuantity?: number;
}

export function ItemBadge({ typeId, showQuantity }: Props) {
  const { getItem } = useItems();
  const item = getItem(typeId);

  return (
    <Wrapper>
      {item?.icon ? (
        <Icon src={`/${item.icon}`} alt={item.name} />
      ) : (
        <IconPlaceholder />
      )}
      <Name>{item?.name ?? `Unknown (type ${typeId})`}</Name>
      {showQuantity != null && <Qty>×{showQuantity.toLocaleString()}</Qty>}
    </Wrapper>
  );
}
