import styled, { keyframes } from "styled-components";

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div<{ $size?: number }>`
  width: ${({ $size }) => $size ?? 24}px;
  height: ${({ $size }) => $size ?? 24}px;
  border: 2px solid ${({ theme }) => theme.colors.surface.border};
  border-top-color: ${({ theme }) => theme.colors.primary.main};
  border-radius: 50%;
  animation: ${spin} 0.6s linear infinite;
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
      <Spinner $size={size} />
    </Wrapper>
  );
}
