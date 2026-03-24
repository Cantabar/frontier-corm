import type { ReactNode } from "react";
import styled from "styled-components";

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
`;

const Panel = styled.div`
  background: ${({ theme }) => theme.colors.surface.overlay};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-top: 2px solid ${({ theme }) => theme.colors.rust.main};
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  padding: ${({ theme }) => theme.spacing.lg};
  min-width: 400px;
  max-width: 560px;
  max-height: 80vh;
  overflow-y: auto;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ModalTitle = styled.h2`
  font-size: 18px;
  font-weight: 700;
  font-family: ${({ theme }) => theme.fonts.heading};
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 20px;
  line-height: 1;
  padding: ${({ theme }) => theme.spacing.xs};

  &:hover {
    color: ${({ theme }) => theme.colors.text.primary};
  }
`;

export function Modal({
  title,
  onClose,
  disableClose,
  children,
}: {
  title: string;
  onClose: () => void;
  disableClose?: boolean;
  children: ReactNode;
}) {
  return (
    <Overlay onMouseDown={(e) => { if (!disableClose && e.target === e.currentTarget) onClose(); }}>
      <Panel>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <CloseButton onClick={onClose} disabled={disableClose}>&times;</CloseButton>
        </ModalHeader>
        {children}
      </Panel>
    </Overlay>
  );
}
