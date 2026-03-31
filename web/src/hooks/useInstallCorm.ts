/**
 * Hook for installing a corm on a player-owned Network Node.
 *
 * Filters the player's structures to NetworkNode types and exposes a
 * one-click `installCorm(nodeId)` action that calls the permissionless
 * `corm_state::install` on-chain function.
 */

import { useState, useMemo, useCallback } from "react";
import { useSuiClient, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { useIdentity } from "./useIdentity";
import { useStructures } from "./useStructures";
import { useNotifications } from "./useNotifications";
import { buildInstallCorm, buildInstallCormWithUrl } from "../lib/sui";
import { config } from "../config";
import type { AssemblyData } from "../lib/types";

export interface InstallCormState {
  /** NetworkNode structures owned by the current player. */
  networkNodes: AssemblyData[];
  /** Whether the UI should show (player has nodes + package deployed). */
  canInstall: boolean;
  /** Whether VITE_CORM_CONFIG_ID is set (CormConfig exists on-chain). */
  isConfigured: boolean;
  /** Whether an install transaction is in flight. */
  isInstalling: boolean;
  /** Whether structures are still loading. */
  isLoading: boolean;
  /** Execute the install transaction for a given network node. */
  installCorm: (networkNodeId: string) => Promise<void>;
}

export function useInstallCorm(): InstallCormState {
  const { address, characterId } = useIdentity();
  const { structures, isLoading } = useStructures();
  const { push } = useNotifications();
  const client = useSuiClient();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
  const queryClient = useQueryClient();
  const [isInstalling, setIsInstalling] = useState(false);

  const networkNodes = useMemo(
    () => structures.filter((s) => s.moveType === "NetworkNode"),
    [structures],
  );

  const configId = config.cormConfigId;
  const canInstall = !!address && networkNodes.length > 0;
  const isConfigured =
    !!configId && config.packages.cormState !== "0x0";

  const installCorm = useCallback(
    async (networkNodeId: string) => {
      if (!canInstall) return;
      if (!isConfigured) {
        push({
          level: "error",
          title: "Install Failed",
          message:
            "Corm contracts are not configured. Set VITE_CORM_STATE_PACKAGE_ID and VITE_CORM_CONFIG_ID.",
          source: "install-corm",
        });
        return;
      }

      setIsInstalling(true);
      try {
        // Look up the OwnerCap for this network node so we can set the
        // metadata URL in the same transaction.
        const nodeAssembly = networkNodes.find((n) => n.id === networkNodeId);
        let tx;
        if (characterId && nodeAssembly) {
          // Fetch fresh OwnerCap version/digest to avoid stale Receiving<T>
          const capObj = await client.getObject({ id: nodeAssembly.ownerCapId });
          tx = buildInstallCormWithUrl({
            configId,
            characterId,
            networkNodeId,
            ownerCapId: nodeAssembly.ownerCapId,
            ownerCapVersion: capObj.data?.version ?? nodeAssembly.ownerCapVersion,
            ownerCapDigest: capObj.data?.digest ?? nodeAssembly.ownerCapDigest,
          });
        } else {
          // Fallback: install only (no OwnerCap available)
          tx = buildInstallCorm({ configId, networkNodeId });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await signAndExecute({ transaction: tx as any });

        await client.waitForTransaction({ digest: result.digest });

        // Invalidate corm-related queries so the UI refreshes
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["cormState"] }),
          queryClient.invalidateQueries({ queryKey: ["recentEvents"] }),
          queryClient.invalidateQueries({ queryKey: ["stats"] }),
          // Refresh installed corms discovery (queryEvents for CormStateCreatedEvent)
          queryClient.invalidateQueries({ queryKey: ["sui.queryEvents"] }),
        ]);

        push({
          level: "info",
          title: "Corm Installed",
          message: `Corm successfully installed on Network Node. The corm-brain will begin managing it shortly.`,
          source: "install-corm",
        });
      } catch (err) {
        push({
          level: "error",
          title: "Install Failed",
          message:
            err instanceof Error ? err.message : "Transaction failed.",
          source: "install-corm",
        });
      } finally {
        setIsInstalling(false);
      }
    },
    [canInstall, configId, signAndExecute, queryClient, push, client, isConfigured, characterId, networkNodes],
  );

  return {
    networkNodes,
    canInstall,
    isConfigured,
    isInstalling,
    isLoading,
    installCorm,
  };
}
