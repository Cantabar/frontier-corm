import styled, { css } from "styled-components";

/** Shared HUD corner-cut clip path for small elements (4px cuts) */
const HUD_CLIP_SM = "polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)";

const base = css`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-weight: 600;
  font-size: 13px;
  font-family: ${({ theme }) => theme.fonts.heading};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, text-shadow 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

/**
 * Primary action button — electric-cyan background with dark text,
 * angular HUD corner cuts, hover glow.
 */
export const PrimaryButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: ${({ theme }) => theme.colors.primary.main};
  color: ${({ theme }) => theme.colors.button.primaryText};
  border: none;
  clip-path: ${HUD_CLIP_SM};
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary.hover};
    text-shadow: 0 0 6px currentColor;
  }
`;

/**
 * Secondary / ghost button — dashed border, industrial feel.
 */
export const SecondaryButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: ${({ theme }) => theme.colors.surface.overlay}cc;
  color: ${({ theme }) => theme.colors.text.secondary};
  border: 1px dashed ${({ theme }) => theme.colors.surface.border};
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.surface.borderHover};
    border-style: solid;
  }
`;

/**
 * Danger / destructive-action button — transparent with red accents,
 * subtle pulse on hover.
 */
export const DangerButton = styled.button<{ $fullWidth?: boolean }>`
  ${base}
  background: transparent;
  color: ${({ theme }) => theme.colors.danger};
  border: 1px solid ${({ theme }) => theme.colors.danger};
  clip-path: ${HUD_CLIP_SM};
  width: ${({ $fullWidth }) => ($fullWidth ? "100%" : "auto")};

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.danger}22;
    text-shadow: 0 0 8px ${({ theme }) => theme.colors.danger};
  }
`;
