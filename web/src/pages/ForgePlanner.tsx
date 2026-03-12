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

export function ForgePlanner() {
  return (
    <Page>
      <Title>Forge Planner</Title>
      <EmptyState
        title="No recipes loaded"
        description="Connect your wallet and select a tribe to view the recipe registry."
      />
    </Page>
  );
}
