import styled from "styled-components";
import { ConnectButton } from "@mysten/dapp-kit";
import { useIdentity } from "../../hooks/useIdentity";
import { truncateAddress, generateAvatarColor } from "../../lib/format";

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

const CharacterBadge = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const PortraitImg = styled.img`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
`;

const PortraitPlaceholder = styled.span<{ $color: string }>`
  display: inline-block;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${({ $color }) => $color};
`;

const CharacterName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
`;

export function Header() {
  const { address, characterId, characterName, characterPortraitUrl } = useIdentity();

  const showCharacter = !!address && !!characterId;
  const displayName = characterName || (characterId ? truncateAddress(characterId) : null);
  const avatarColor = characterId ? generateAvatarColor(characterId) : "transparent";

  return (
    <HeaderBar>
      <Brand>
        <Logo>
          Frontier <Accent>Lattice</Accent>
        </Logo>
      </Brand>
      <Controls>
        {showCharacter && (
          <CharacterBadge title={characterId ?? undefined}>
            {characterPortraitUrl ? (
              <PortraitImg src={characterPortraitUrl} alt={displayName ?? ""} />
            ) : (
              <PortraitPlaceholder $color={avatarColor} />
            )}
            <CharacterName>{displayName}</CharacterName>
          </CharacterBadge>
        )}
        <ConnectButton />
      </Controls>
    </HeaderBar>
  );
}
