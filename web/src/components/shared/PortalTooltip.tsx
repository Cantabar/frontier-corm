import { useRef, useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import styled from "styled-components";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Bubble = styled.div<{ $top: number; $left: number; $visible: boolean }>`
  position: fixed;
  top: ${({ $top }) => $top}px;
  left: ${({ $left }) => $left}px;
  transform: translateX(-50%);
  background: ${({ theme }) => theme.colors.surface.overlay};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  transition: opacity 0.12s ease;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const GAP = 6;

interface Props {
  targetRef: RefObject<HTMLElement | null>;
  visible: boolean;
  children: ReactNode;
}

/**
 * Renders a tooltip into a portal on `document.body`, positioned above (or
 * below) the target element. Because it lives outside the DOM hierarchy of
 * the target, it is unaffected by ancestor `overflow` rules.
 */
export function PortalTooltip({ targetRef, visible, children }: Props) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  // Track whether we've measured at least once so the first render doesn't
  // flash at (0,0).
  const [measured, setMeasured] = useState(false);

  useLayoutEffect(() => {
    if (!visible || !targetRef.current) {
      setMeasured(false);
      return;
    }

    const target = targetRef.current;
    const rect = target.getBoundingClientRect();
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;

    // Prefer placing above; fall back to below if too close to viewport top.
    const fitsAbove = rect.top - GAP - bubbleHeight > 0;
    const top = fitsAbove
      ? rect.top - GAP - bubbleHeight
      : rect.bottom + GAP;
    const left = rect.left + rect.width / 2;

    setPos({ top, left });
    setMeasured(true);
  }, [visible, targetRef]);

  if (!visible) return null;

  return createPortal(
    <Bubble
      ref={bubbleRef}
      $top={pos.top}
      $left={pos.left}
      $visible={measured}
    >
      {children}
    </Bubble>,
    document.body,
  );
}
