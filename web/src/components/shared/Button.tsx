import styled, { css } from "styled-components";

const base = css`
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * Primary action button — electric-cyan background with dark text for
 * accessible contrast (10.8 : 1 ratio, WCAG AAA).
 */
export const PrimaryButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: ${({ theme }) => theme.colors.primary.main};
  color: ${({ theme }) => theme.colors.button.primaryText};
  border: none;
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary.hover};
  }
`;

/**
 * Secondary / ghost button — transparent with a subtle border.
 */
export const SecondaryButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: ${({ theme }) => theme.colors.surface.overlay};
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.borderHover};
  }
`;

/**
 * Danger / destructive-action button — transparent with red accents.
 */
export const DangerButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: transparent;
  color: ${({ theme }) => theme.colors.danger};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.danger}22;
  }
`;
