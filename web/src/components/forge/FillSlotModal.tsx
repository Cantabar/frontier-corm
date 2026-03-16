import { useState, useMemo } from "react";
import styled from "styled-components";
import { useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Modal } from "../shared/Modal";
import { ItemBadge } from "../shared/ItemBadge";
import { SsuPickerField } from "../shared/SsuPickerField";
import { PrimaryButton } from "../shared/Button";
import { useIdentity } from "../../hooks/useIdentity";
import { useMyStructures } from "../../hooks/useStructures";
import { buildFillMultiInputSlot, type ItemAccessMode } from "../../lib/sui";
import type { MultiInputContractData, MultiInputSlot } from "../../lib/types";

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Input = styled.input`
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

const SlotList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SlotOption = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ $active, theme }) =>
    $active ? theme.colors.primary.subtle : theme.colors.surface.bg};
  border: 1px solid
    ${({ $active, theme }) =>
      $active ? theme.colors.primary.main : theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  cursor: pointer;
  text-align: left;
  width: 100%;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary.muted};
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const SlotMeta = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
`;

const FieldGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

interface Props {
  contract: MultiInputContractData;
  posterCharId: string;
  onClose: () => void;
}

export function FillSlotModal({ contract, posterCharId, onClose }: Props) {
  const {
    characterId,
    characterOwnerCapId,
    characterOwnerCapVersion,
    characterOwnerCapDigest,
  } = useIdentity();
  const { structures } = useMyStructures();
  const { mutateAsync: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // Pick the first unfilled slot by default
  const firstOpenSlot =
    contract.slots.find((s) => s.filled < s.required) ?? contract.slots[0];

  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(
    firstOpenSlot?.typeId ?? null,
  );
  const [quantity, setQuantity] = useState("1");
  const [sourceSsuId, setSourceSsuId] = useState("");
  const [sourceSsuOwned, setSourceSsuOwned] = useState(true);

  const selectedSsu = structures.find((s) => s.id === sourceSsuId);
  const selectedSlot: MultiInputSlot | undefined = contract.slots.find(
    (s) => s.typeId === selectedTypeId,
  );
  const remaining = selectedSlot
    ? Math.max(0, selectedSlot.required - selectedSlot.filled)
    : 0;

  const accessMode: ItemAccessMode | null = useMemo(() => {
    if (sourceSsuOwned && selectedSsu) {
      return {
        mode: "ssuOwner",
        ownerCapId: selectedSsu.ownerCapId,
        ownerCapVersion: selectedSsu.ownerCapVersion,
        ownerCapDigest: selectedSsu.ownerCapDigest,
      };
    }
    if (!sourceSsuOwned && characterOwnerCapId && characterOwnerCapVersion && characterOwnerCapDigest) {
      return {
        mode: "character",
        ownerCapId: characterOwnerCapId,
        ownerCapVersion: characterOwnerCapVersion,
        ownerCapDigest: characterOwnerCapDigest,
      };
    }
    return null;
  }, [sourceSsuOwned, selectedSsu, characterOwnerCapId, characterOwnerCapVersion, characterOwnerCapDigest]);

  async function handleFill() {
    if (
      !characterId ||
      !sourceSsuId ||
      !accessMode ||
      selectedTypeId === null ||
      Number(quantity) <= 0
    )
      return;

    const tx = buildFillMultiInputSlot({
      contractId: contract.id,
      destinationSsuId: contract.destinationSsuId,
      posterCharId,
      fillerCharId: characterId,
      fillerSsuId: sourceSsuId,
      access: accessMode,
      typeId: selectedTypeId,
      quantity: Number(quantity),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await signAndExecute({ transaction: tx as any });
    onClose();
  }

  return (
    <Modal title="Fill Slot" onClose={onClose} disableClose={isPending}>
      <Label>Select Slot</Label>
      <SlotList>
        {contract.slots.map((slot) => {
          const slotRemaining = Math.max(0, slot.required - slot.filled);
          const full = slotRemaining === 0;
          return (
            <SlotOption
              key={slot.typeId}
              $active={slot.typeId === selectedTypeId}
              onClick={() => {
                setSelectedTypeId(slot.typeId);
                setQuantity(String(Math.min(1, slotRemaining)));
              }}
              disabled={full}
            >
              <ItemBadge typeId={slot.typeId} />
              <SlotMeta>
                {slot.filled.toLocaleString()} / {slot.required.toLocaleString()}
                {full && " ✓"}
              </SlotMeta>
            </SlotOption>
          );
        })}
      </SlotList>

      <FieldGroup>
        <Label>Quantity (remaining: {remaining.toLocaleString()})</Label>
        <Input
          type="number"
          min={1}
          max={remaining}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </FieldGroup>

      <FieldGroup>
        <Label>Source SSU</Label>
        <SsuPickerField
          value={sourceSsuId}
          onChange={(id, owned) => {
            setSourceSsuId(id);
            setSourceSsuOwned(owned);
          }}
          placeholder="Select source SSU…"
          allowManualEntry
        />
      </FieldGroup>

      <PrimaryButton
        $fullWidth
        onClick={handleFill}
        disabled={
          !characterId ||
          !sourceSsuId ||
          !accessMode ||
          selectedTypeId === null ||
          remaining <= 0 ||
          Number(quantity) <= 0 ||
          isPending
        }
      >
        {isPending ? "Filling…" : "Fill Slot"}
      </PrimaryButton>
    </Modal>
  );
}
