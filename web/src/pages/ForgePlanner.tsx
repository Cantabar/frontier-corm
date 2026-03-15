import { useState, useCallback } from "react";
import styled from "styled-components";
import { useIdentity } from "../hooks/useIdentity";
import { useManufacturingHistory } from "../hooks/useOrders";
import { useBlueprints } from "../hooks/useBlueprints";
import { useActiveMultiInputContracts, useMultiInputContractObject } from "../hooks/useMultiInputContracts";
import { BlueprintBrowser } from "../components/forge/BlueprintBrowser";
import { OptimizerPanel } from "../components/forge/OptimizerPanel";
import { CreateMultiInputContractModal } from "../components/forge/CreateMultiInputContractModal";
import { MultiInputContractCard } from "../components/forge/MultiInputContractCard";
import { MultiInputContractDetail } from "../components/forge/MultiInputContractDetail";
import { LoadingSpinner } from "../components/shared/LoadingSpinner";
import { EmptyState } from "../components/shared/EmptyState";
import { PrimaryButton } from "../components/shared/Button";
import { timeAgo, truncateAddress } from "../lib/format";
import type { MultiInputContractData } from "../lib/types";

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const SectionLabel = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.primary};
  margin: ${({ theme }) => theme.spacing.lg} 0 ${({ theme }) => theme.spacing.md};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.lg};
  align-items: start;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const EventRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface.raised};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  font-size: 13px;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const EventName = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.module.forgePlanner};
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 12px;
`;

/** Thin wrapper so each card can independently fetch live fill totals. */
function ContractCardWithLiveState({
  contract,
  onClick,
}: {
  contract: MultiInputContractData;
  onClick: () => void;
}) {
  const { contract: live } = useMultiInputContractObject(contract.id);
  return (
    <MultiInputContractCard
      contract={contract}
      liveFilledTotal={live?.totalFilled}
      onClick={onClick}
    />
  );
}

export function ForgePlanner() {
  const { characterId, tribeCaps } = useIdentity();
  const tribeId = tribeCaps[0]?.tribeId;

  const { blueprints, recipesForOptimizer } = useBlueprints();
  const { data: historyData, isLoading: historyLoading } = useManufacturingHistory(tribeId);
  const { contracts, isLoading: contractsLoading } = useActiveMultiInputContracts();

  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [selectedContract, setSelectedContract] = useState<MultiInputContractData | null>(null);

  // Optimizer auto-fill: set from BlueprintDetailModal's "Resolve in Optimizer"
  const [optimizerTarget, setOptimizerTarget] = useState<number | null>(null);

  const handleResolve = useCallback((outputTypeId: number) => {
    setOptimizerTarget(outputTypeId);
  }, []);

  return (
    <Page>
      <Header>
        <Title>Forge Planner</Title>
        {characterId && (
          <PrimaryButton onClick={() => setShowCreateOrder(true)}>+ New Order</PrimaryButton>
        )}
      </Header>

      {/* Blueprint browser — always visible (static data, no wallet needed) */}
      <BlueprintBrowser blueprints={blueprints} onResolve={handleResolve} />

      <Grid>
        <div>
          <OptimizerPanel
            recipes={recipesForOptimizer}
            initialTarget={optimizerTarget}
          />
        </div>
        <div>
          <SectionLabel>Manufacturing History</SectionLabel>
          {!tribeId ? (
            <EmptyState
              title="No tribe selected"
              description="Connect your wallet and join a tribe to see manufacturing history."
            />
          ) : historyLoading ? (
            <LoadingSpinner />
          ) : !historyData?.events?.length ? (
            <EmptyState title="No manufacturing events" />
          ) : (
            historyData.events.map((ev) => (
              <EventRow key={ev.id}>
                <div>
                  <EventName>{ev.event_name.replace("Event", "")}</EventName>
                  {ev.character_id && (
                    <Meta> · {truncateAddress(ev.character_id)}</Meta>
                  )}
                </div>
                <Meta>{timeAgo(ev.timestamp_ms)}</Meta>
              </EventRow>
            ))
          )}
        </div>
      </Grid>

      <SectionLabel>Active Orders</SectionLabel>
      {contractsLoading ? (
        <LoadingSpinner />
      ) : contracts.length === 0 ? (
        <EmptyState
          title="No active orders"
          description={characterId ? "Create a new order to get started." : "Connect your wallet to post orders."}
        />
      ) : (
        contracts.map((c) => (
          <ContractCardWithLiveState
            key={c.id}
            contract={c}
            onClick={() => setSelectedContract(c)}
          />
        ))
      )}

      {showCreateOrder && (
        <CreateMultiInputContractModal onClose={() => setShowCreateOrder(false)} />
      )}

      {selectedContract && (
        <MultiInputContractDetail
          contract={selectedContract}
          characterId={characterId}
          onClose={() => setSelectedContract(null)}
        />
      )}
    </Page>
  );
}
