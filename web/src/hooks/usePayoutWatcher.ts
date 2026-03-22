/**
 * Payout & Pickup Watcher — polls the indexer for contract fill events
 * relevant to the connected user and pushes notifications.
 *
 * Covers two roles:
 *   - **Filler**: user filled a contract and received escrow/items/bounty
 *   - **Poster**: someone filled the user's contract and the user received
 *     fill payment or items were deposited at an SSU for pickup
 *
 * Uses a localStorage watermark so duplicate notifications are never
 * pushed across re-renders or page refreshes.
 */

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIdentity } from "./useIdentity";
import { useNotifications, type NotificationLevel } from "./useNotifications";
import { getPayoutEvents, getContractContext } from "../lib/api";
import { truncateAddress, formatAmount } from "../lib/format";
import type { ArchivedEvent } from "../lib/types";

// ---------------------------------------------------------------------------
// Contract type classification
// ---------------------------------------------------------------------------

/** Contract variants that pay the filler in items (need SSU pickup). */
const ITEM_PAYOUT_VARIANTS = new Set(["ItemForCoin", "ItemForItem"]);

/** Contract variants that deliver items to the poster (need SSU pickup). */
const POSTER_ITEM_RECEIPT_VARIANTS = new Set([
  "CoinForItem",
  "ItemForItem",
  "Transport",
  "MultiInput",
]);

/** Creation event name → contract variant shorthand. */
function variantFromCreationEvent(eventName: string): string {
  if (eventName.includes("CoinForCoin")) return "CoinForCoin";
  if (eventName.includes("CoinForItem")) return "CoinForItem";
  if (eventName.includes("ItemForCoin")) return "ItemForCoin";
  if (eventName.includes("ItemForItem")) return "ItemForItem";
  if (eventName.includes("Transport")) return "Transport";
  if (eventName.includes("MultiInput")) return "MultiInput";
  return "Unknown";
}

/** Extract relevant SSU ID from a creation event's data for pickup notices. */
function extractSsuId(
  variant: string,
  role: "filler" | "poster",
  data: Record<string, unknown>,
): string | null {
  if (role === "filler") {
    // Filler picks up items at source SSU (ItemForCoin, ItemForItem)
    if (ITEM_PAYOUT_VARIANTS.has(variant)) {
      return (data.source_ssu_id as string) ?? null;
    }
  } else {
    // Poster picks up items at destination SSU
    if (POSTER_ITEM_RECEIPT_VARIANTS.has(variant)) {
      return (data.destination_ssu_id as string) ?? null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Watermark persistence
// ---------------------------------------------------------------------------

function watermarkKey(characterId: string): string {
  return `corm:payoutWatermark:${characterId}`;
}

function readWatermark(characterId: string): number | undefined {
  try {
    const raw = localStorage.getItem(watermarkKey(characterId));
    return raw ? Number(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeWatermark(characterId: string, eventId: number): void {
  try {
    localStorage.setItem(watermarkKey(characterId), String(eventId));
  } catch {
    /* storage full — best-effort */
  }
}

// ---------------------------------------------------------------------------
// Contract context cache (in-memory, per session)
// ---------------------------------------------------------------------------

interface ContractMeta {
  variant: string;
  posterId: string;
  data: Record<string, unknown>;
}

const contextCache = new Map<string, ContractMeta>();

async function resolveContractMeta(contractId: string): Promise<ContractMeta | null> {
  const cached = contextCache.get(contractId);
  if (cached) return cached;

  try {
    const event = await getContractContext(contractId);
    const meta: ContractMeta = {
      variant: variantFromCreationEvent(event.event_name),
      posterId: (event.event_data?.poster_id as string) ?? "",
      data: event.event_data ?? {},
    };
    contextCache.set(contractId, meta);
    return meta;
  } catch {
    // Context not found (contract may have been created before indexer started)
    return null;
  }
}

// ---------------------------------------------------------------------------
// Notification composition
// ---------------------------------------------------------------------------

interface NotifPayload {
  level: NotificationLevel;
  title: string;
  message: string;
}

function composeNotification(
  event: ArchivedEvent,
  role: "filler" | "poster",
  meta: ContractMeta | null,
): NotifPayload {
  const data = event.event_data ?? {};
  const contractId = (data.contract_id as string) ?? event.primary_id ?? "";
  const shortId = truncateAddress(contractId);
  const variant = meta?.variant ?? "Unknown";

  // TransportDeliveredEvent has different field names
  if (event.event_name === "TransportDeliveredEvent") {
    const payment = data.payment_released as string | undefined;
    const delivered = data.delivered_quantity as string | undefined;
    const remaining = data.remaining_quantity as string | undefined;

    if (role === "filler") {
      // Courier received payment
      return {
        level: "success",
        title: "Transport Payment",
        message: `Received ${formatAmount(payment ?? "0")} for delivering to contract ${shortId}`,
      };
    }
    // Poster received items at destination SSU
    const ssuId = extractSsuId(variant, "poster", meta?.data ?? {});
    return {
      level: "info",
      title: "Delivery Arrived",
      message: `${delivered ?? "?"} items delivered to SSU ${truncateAddress(ssuId)}${remaining === "0" ? " — contract complete!" : ""}`,
    };
  }

  // SlotFilledEvent (multi-input)
  if (event.event_name === "SlotFilledEvent") {
    const payout = data.payout_amount as string | undefined;
    const totalRemaining = data.total_remaining as string | undefined;

    if (role === "filler") {
      return {
        level: "success",
        title: "Bounty Received",
        message: `Received ${formatAmount(payout ?? "0")} bounty for filling slot on contract ${shortId}`,
      };
    }
    // Poster: items delivered to destination SSU
    const ssuId = extractSsuId(variant, "poster", meta?.data ?? {});
    return {
      level: "info",
      title: "Materials Delivered",
      message: `Materials deposited at SSU ${truncateAddress(ssuId)}${totalRemaining === "0" ? " — order complete!" : ""}`,
    };
  }

  // ContractFilledEvent — the common case
  const payoutAmount = data.payout_amount as string | undefined;
  const fillQuantity = data.fill_quantity as string | undefined;
  const remaining = data.remaining_quantity as string | undefined;
  const completeSuffix = remaining === "0" ? " — contract complete!" : "";

  if (role === "filler") {
    // Filler received escrow or items
    const isItemPayout = ITEM_PAYOUT_VARIANTS.has(variant);

    if (isItemPayout) {
      const ssuId = extractSsuId(variant, "filler", meta?.data ?? {});
      return {
        level: "info",
        title: "Items Ready",
        message: `${payoutAmount ?? "?"} items await pickup at SSU ${truncateAddress(ssuId)}${completeSuffix}`,
      };
    }

    return {
      level: "success",
      title: "Payout Received",
      message: `Received ${formatAmount(payoutAmount ?? "0")} from contract ${shortId}${completeSuffix}`,
    };
  }

  // Poster received fill payment or items
  const fillerId = data.filler_id as string | undefined;
  const isPosterItemReceipt = POSTER_ITEM_RECEIPT_VARIANTS.has(variant);

  if (isPosterItemReceipt) {
    const ssuId = extractSsuId(variant, "poster", meta?.data ?? {});
    return {
      level: "info",
      title: "Items Delivered",
      message: `${truncateAddress(fillerId)} delivered items to SSU ${truncateAddress(ssuId)}${completeSuffix}`,
    };
  }

  return {
    level: "success",
    title: "Contract Filled",
    message: `${truncateAddress(fillerId)} paid ${formatAmount(fillQuantity ?? "0")} on contract ${shortId}${completeSuffix}`,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 10_000;

export function usePayoutWatcher(): void {
  const { characterId } = useIdentity();
  const { push } = useNotifications();
  const processingRef = useRef(false);

  // Read watermark from localStorage on mount / characterId change
  const watermarkRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (characterId) {
      watermarkRef.current = readWatermark(characterId);
    }
  }, [characterId]);

  const { data } = useQuery({
    queryKey: ["payoutWatcher", characterId, watermarkRef.current],
    queryFn: () => getPayoutEvents(characterId!, watermarkRef.current),
    enabled: !!characterId,
    refetchInterval: POLL_INTERVAL_MS,
    // Don't refetch on window focus — the interval handles it
    refetchOnWindowFocus: false,
  });

  const processEvents = useCallback(
    async (events: ArchivedEvent[]) => {
      if (!characterId || events.length === 0) return;

      // Collect unique contract IDs to batch-resolve context
      const contractIds = new Set<string>();
      for (const ev of events) {
        const cid = (ev.event_data?.contract_id as string) ?? ev.primary_id ?? "";
        if (cid) contractIds.add(cid);
      }

      // Resolve contract metadata (parallel, cached)
      await Promise.all(
        [...contractIds].map((cid) => resolveContractMeta(cid)),
      );

      // Push notifications
      for (const ev of events) {
        const cid = (ev.event_data?.contract_id as string) ?? ev.primary_id ?? "";
        const meta = contextCache.get(cid) ?? null;
        const role: "filler" | "poster" =
          ev.character_id === characterId ? "filler" : "poster";

        const notif = composeNotification(ev, role, meta);
        push({ ...notif, source: "payout-watcher" });
      }

      // Advance watermark to highest event ID
      const maxId = Math.max(...events.map((e) => e.id));
      watermarkRef.current = maxId;
      writeWatermark(characterId, maxId);
    },
    [characterId, push],
  );

  // Process new events when data arrives
  useEffect(() => {
    const events = data?.events;
    if (!events || events.length === 0 || processingRef.current) return;

    processingRef.current = true;
    processEvents(events).finally(() => {
      processingRef.current = false;
    });
  }, [data, processEvents]);
}
