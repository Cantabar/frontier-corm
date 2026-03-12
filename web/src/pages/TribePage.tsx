import { useParams } from "react-router-dom";
import styled from "styled-components";

const Page = styled.div`
  max-width: 960px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

export function TribePage() {
  const { tribeId } = useParams<{ tribeId: string }>();

  return (
    <Page>
      <Title>Tribe</Title>
      <p>
        Viewing tribe <code>{tribeId}</code>
      </p>
    </Page>
  );
}
