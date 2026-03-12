import styled from "styled-components";
import { ConnectButton } from "@mysten/dapp-kit";

const HeaderBar = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface.raised};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface.border};
  height: 56px;
  flex-shrink: 0;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Logo = styled.span`
  font-size: 18px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  letter-spacing: -0.02em;
`;

const Accent = styled.span`
  color: ${({ theme }) => theme.colors.primary.main};
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

export function Header() {
  return (
    <HeaderBar>
      <Brand>
        <Logo>
          Frontier <Accent>Lattice</Accent>
        </Logo>
      </Brand>
      <Controls>
        <ConnectButton />
      </Controls>
    </HeaderBar>
  );
}
