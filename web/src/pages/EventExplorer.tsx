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

export function EventExplorer() {
  return (
    <Page>
      <Title>Event Explorer</Title>
      <EmptyState
        title="No events yet"
        description="Events will appear here once the indexer is running and contracts are deployed."
      />
    </Page>
  );
}
