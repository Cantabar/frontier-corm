import { NavLink } from "react-router-dom";
import styled from "styled-components";

const Nav = styled.nav`
  width: 200px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.colors.surface.raised};
  border-right: 1px solid ${({ theme }) => theme.colors.surface.border};
  padding: ${({ theme }) => theme.spacing.md} 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const StyledLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text.secondary};
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
    background: ${({ theme }) => theme.colors.surface.overlay};
  }

  &.active {
    color: ${({ theme }) => theme.colors.primary.main};
    border-left-color: ${({ theme }) => theme.colors.primary.main};
    background: ${({ theme }) => theme.colors.surface.overlay};
  }
`;

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.text.muted};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg}
    ${({ theme }) => theme.spacing.xs};
`;

export function Sidebar() {
  return (
    <Nav>
      <StyledLink to="/" end>
        Dashboard
      </StyledLink>
      <SectionLabel>Modules</SectionLabel>
      <StyledLink to="/jobs">Contract Board</StyledLink>
      <StyledLink to="/forge">Forge Planner</StyledLink>
      <StyledLink to="/events">Event Explorer</StyledLink>
    </Nav>
  );
}
