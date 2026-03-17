/**
 * Editable table of items for bulk ItemForCoin creation.
 *
 * Each row shows: item icon + name, editable quantity, price mode toggle
 * (unit/total), price input with computed counterpart, inline errors, and
 * a remove button.
 */

import styled from "styled-components";
import { useItems } from "../../hooks/useItems";
import type { BulkItemRow, PriceMode } from "../../lib/bulkItemForCoin";
import { validateRow, hasRowError, computeCounterpart } from "../../lib/bulkItemForCoin";
import { ItemBadge } from "../shared/ItemBadge";

// ── Styled components ──────────────────────────────────────────

const Table = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RowCard = styled.div<{ $hasError: boolean }>`
  display: grid;
  grid-template-columns: 2fr 1fr 80px 1.2fr auto;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: start;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid
    ${({ $hasError, theme }) =>
      $hasError ? theme.colors.danger + "66" : theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const Cell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CellLabel = styled.span`
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const CellInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 4px 8px;
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const ModeToggle = styled.button<{ $active: boolean }>`
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary.main : theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary.subtle : "transparent"};
  color: ${({ $active, theme }) =>
    $active ? theme.colors.primary.main : theme.colors.text.muted};
  cursor: pointer;
`;

const ModeRow = styled.div`
  display: flex;
  gap: 2px;
`;

const RemoveBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  align-self: center;

  &:hover {
    color: ${({ theme }) => theme.colors.danger};
  }
`;

const FieldError = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.danger};
`;

const Hint = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.muted};
  border: 1px dashed ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
`;

const ItemCell = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  min-height: 32px;
`;

// ── Component ──────────────────────────────────────────────────

interface Props {
  rows: BulkItemRow[];
  onChange: (rows: BulkItemRow[]) => void;
  allowPartial: boolean;
  decimals: number;
  symbol: string;
  submitted: boolean;
}

export function BulkItemEditor({
  rows,
  onChange,
  allowPartial,
  decimals,
  symbol,
  submitted,
}: Props) {
  const { getItem } = useItems();

  function updateRow(index: number, patch: Partial<BulkItemRow>) {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  if (rows.length === 0) {
    return <EmptyState>No items selected — use the picker above to add items.</EmptyState>;
  }

  return (
    <Table>
      {rows.map((row, i) => {
        const err = validateRow(row, allowPartial, decimals, symbol);
        const showErrors = submitted && hasRowError(err);
        const counterpart = computeCounterpart(row, decimals);
        const info = getItem(row.typeId);

        return (
          <RowCard key={row.typeId} $hasError={showErrors}>
            {/* Item */}
            <Cell>
              <CellLabel>Item</CellLabel>
              <ItemCell>
                <ItemBadge typeId={row.typeId} />
              </ItemCell>
            </Cell>

            {/* Quantity */}
            <Cell>
              <CellLabel>Qty (max {row.availableQuantity.toLocaleString()})</CellLabel>
              <CellInput
                type="number"
                min={1}
                max={row.availableQuantity}
                value={row.quantity || ""}
                onChange={(e) => updateRow(i, { quantity: Number(e.target.value) || 0 })}
              />
              {submitted && err.quantity && <FieldError>{err.quantity}</FieldError>}
            </Cell>

            {/* Price mode */}
            <Cell>
              <CellLabel>Mode</CellLabel>
              <ModeRow>
                <ModeToggle
                  $active={row.priceMode === "unit"}
                  onClick={() => updateRow(i, { priceMode: "unit" as PriceMode })}
                >
                  Unit
                </ModeToggle>
                <ModeToggle
                  $active={row.priceMode === "total"}
                  onClick={() => updateRow(i, { priceMode: "total" as PriceMode })}
                >
                  Total
                </ModeToggle>
              </ModeRow>
            </Cell>

            {/* Price input */}
            <Cell>
              <CellLabel>
                {row.priceMode === "unit" ? `Unit Price (${symbol})` : `Total Price (${symbol})`}
              </CellLabel>
              <CellInput
                type="number"
                min={0}
                step="any"
                placeholder="0.0"
                value={row.priceInput}
                onChange={(e) => updateRow(i, { priceInput: e.target.value })}
              />
              {submitted && err.price && <FieldError>{err.price}</FieldError>}
              {submitted && err.divisibility && <FieldError>{err.divisibility}</FieldError>}
              {!showErrors && row.priceInput && Number(row.priceInput) >= 0 && row.quantity > 0 && (
                <Hint>
                  {row.priceMode === "unit"
                    ? `Total: ${counterpart.totalPrice} ${symbol}`
                    : `Per item: ${counterpart.unitPrice} ${symbol}`}
                </Hint>
              )}
            </Cell>

            {/* Remove */}
            <RemoveBtn title={`Remove ${info?.name ?? "item"}`} onClick={() => removeRow(i)}>
              ×
            </RemoveBtn>
          </RowCard>
        );
      })}
    </Table>
  );
}
