import styled, { keyframes } from "styled-components";

/** Segments light up in sequence around a square border */
const segmentPulse = keyframes`
  0%   { border-color: transparent; border-top-color: currentColor; }
  25%  { border-color: transparent; border-right-color: currentColor; }
  50%  { border-color: transparent; border-bottom-color: currentColor; }
  75%  { border-color: transparent; border-left-color: currentColor; }
  100% { border-color: transparent; border-top-color: currentColor; }
`;

const blink = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
`;

const Scanner = styled.div<{ $size?: number }>`
  width: ${({ $size }) => $size ?? 24}px;
  height: ${({ $size }) => $size ?? 24}px;
  border: 2px solid transparent;
  border-top-color: ${({ theme }) => theme.colors.primary.main};
  color: ${({ theme }) => theme.colors.primary.main};
  animation: ${segmentPulse} 1.2s linear infinite;
  position: relative;

  /* Inner crosshair dot */
  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 4px;
    height: 4px;
    background: ${({ theme }) => theme.colors.primary.main};
    animation: ${blink} 1.2s ease-in-out infinite;
  }
`;

const Wrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

export function LoadingSpinner({ size }: { size?: number }) {
  return (
    <Wrapper>
      <Scanner $size={size} />
    </Wrapper>
  );
}
