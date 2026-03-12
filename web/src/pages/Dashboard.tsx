import styled from "styled-components";
import { useCurrentAccount } from "@mysten/dapp-kit";

const Page = styled.div`
  max-width: 960px;
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ConnectPrompt = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xxl};
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 16px;
`;

export function Dashboard() {
  const account = useCurrentAccount();

  if (!account) {
    return (
      <Page>
        <Title>Dashboard</Title>
        <ConnectPrompt>Connect your wallet to get started.</ConnectPrompt>
      </Page>
    );
  }

  return (
    <Page>
      <Title>Dashboard</Title>
      <p>
        Connected as{" "}
        <code>
          {account.address.slice(0, 8)}...{account.address.slice(-6)}
        </code>
      </p>
    </Page>
  );
}
