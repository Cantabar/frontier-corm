import { useMemo } from "react";
import styled from "styled-components";
import { useMyStructures } from "../../hooks/useStructures";
import { ASSEMBLY_TYPES } from "../../lib/types";
import { truncateAddress } from "../../lib/format";

const Select = styled.select`
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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-top: -${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

interface Props {
  value: string;
  onChange: (ssuId: string) => void;
  placeholder?: string;
}

export function SsuPickerField({ value, onChange, placeholder = "Select an SSU…" }: Props) {
  const { structures, isLoading } = useMyStructures();

  const ssus = useMemo(
    () => structures.filter((s) => s.moveType === "StorageUnit"),
    [structures],
  );

  if (isLoading) {
    return <Select disabled><option>Loading structures…</option></Select>;
  }

  if (ssus.length === 0) {
    return (
      <>
        <Select disabled>
          <option>No SSUs found</option>
        </Select>
        <Hint>You need to own at least one SSU on-chain.</Hint>
      </>
    );
  }

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {ssus.map((ssu) => (
        <option key={ssu.id} value={ssu.id}>
          {ssu.name || ASSEMBLY_TYPES[ssu.typeId]?.label || "SSU"} — {truncateAddress(ssu.id, 8, 6)}
        </option>
      ))}
    </Select>
  );
}
