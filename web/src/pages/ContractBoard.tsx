import styled from "styled-components";
import { EmptyState } from "../components/shared/EmptyState";

const Page = styled.div`
  max-width: 960px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

export function ContractBoard() {
  return (
    <Page>
      <Title>Contract Board</Title>
      <EmptyState
        title="No active jobs"
        description="Post a job or connect your wallet to browse contracts."
      />
    </Page>
  );
}
