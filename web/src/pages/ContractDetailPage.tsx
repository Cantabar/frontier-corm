import { useParams, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { useContractObject } from "../hooks/useContracts";
import { ContractDetail } from "../components/contracts/ContractDetail";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { EmptyState } from "../components/shared/EmptyState";
import { SecondaryButton } from "../components/shared/Button";

const Page = styled.div``;

const BackButton = styled(SecondaryButton)`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

export function ContractDetailPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { contract, isLoading, error } = useContractObject(contractId);

  if (isLoading) return <LoadingSpinner />;

  if (!contract) {
    return (
      <Page>
        <BackButton onClick={() => navigate("/contracts")}>← Back to list</BackButton>
        <EmptyState
          title="Contract not found"
          description={
            error
              ? `Error loading contract: ${error.message}`
              : `No contract found with ID ${contractId ?? "unknown"}`
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <BackButton onClick={() => navigate("/contracts")}>← Back to list</BackButton>
      <ContractDetail contract={contract} onStatusChange={() => navigate("/contracts")} />
    </Page>
  );
}
