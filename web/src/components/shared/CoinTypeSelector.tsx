import { useState } from "react";
import styled from "styled-components";
import { useCoinTypes } from "../../hooks/useCoinTypes";
import { parseCoinSymbol, parseCoinModule } from "../../lib/coinUtils";
import { config } from "../../config";

const Wrapper = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const Select = styled.select`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Input = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  margin-top: ${({ theme }) => theme.spacing.xs};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const HelpText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-top: 4px;
`;

const CUSTOM_VALUE = "__custom__";

interface Props {
  value: string;
  onChange: (coinType: string) => void;
  label?: string;
}

export function CoinTypeSelector({ value, onChange, label = "Treasury Coin Type" }: Props) {
  const { coinTypes } = useCoinTypes();
  const [isCustom, setIsCustom] = useState(false);

  // Check if the current value matches a discovered coin type
  const isKnown = coinTypes.some((c) => c.coinType === value);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selected = e.target.value;
    if (selected === CUSTOM_VALUE) {
      setIsCustom(true);
      onChange("");
    } else {
      setIsCustom(false);
      onChange(selected);
    }
  }

  return (
    <Wrapper>
      <Label>{label}</Label>
      <Select
        value={isCustom ? CUSTOM_VALUE : isKnown ? value : CUSTOM_VALUE}
        onChange={handleSelectChange}
      >
        {coinTypes.map((c) => {
          const isCormDefault = config.cormCoinType && c.coinType === config.cormCoinType;
          return (
            <option key={c.coinType} value={c.coinType}>
              {parseCoinSymbol(c.coinType)} ({parseCoinModule(c.coinType)}){isCormDefault ? " — default" : ""}
            </option>
          );
        })}
        <option value={CUSTOM_VALUE}>Custom coin type…</option>
      </Select>
      {(isCustom || (!isKnown && value)) && (
        <>
          <Input
            placeholder="Full coin type, e.g. 0xabc::my_coin::MYCOIN"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoFocus
          />
          <HelpText>Paste the full Move type string for the coin</HelpText>
        </>
      )}
    </Wrapper>
  );
}
