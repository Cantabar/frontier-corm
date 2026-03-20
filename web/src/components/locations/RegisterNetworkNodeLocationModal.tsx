/**
 * Modal for registering a Network Node's location as an encrypted POD.
 *
 * All structures connected to the Network Node automatically receive
 * derived PODs with the same encrypted location data.
 *
 * Flow:
 *   1. Select one of the player's owned Network Nodes
 *   2. Pick a solar system (required) + optional xyz coordinates
 *   3. Confirm → sign, encrypt, submit
 */

import { useState, useMemo } from "react";
import styled from "styled-components";
import { Modal } from "../shared/Modal";
import { PrimaryButton, SecondaryButton } from "../shared/Button";
import { SolarSystemPicker } from "../shared/SolarSystemPicker";
import { useMyStructures } from "../../hooks/useStructures";
import { useNetworkNodes } from "../../hooks/useNetworkNodes";
import { useLocationPods } from "../../hooks/useLocationPods";
import { truncateAddress } from "../../lib/format";
import { solarSystemName } from "../../lib/solarSystems";
import type { SolarSystemEntry } from "../../lib/solarSystems";
import type { LocationData } from "../../lib/locationCrypto";

// ============================================================
// Constants
// ============================================================

/** Network Node typeId from ASSEMBLY_TYPES. */
const NETWORK_NODE_TYPE_ID = 88092;

// ============================================================
// Styled primitives
// ============================================================

const Label = styled.label`
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const Select = styled.select`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  margin-bottom: ${({ theme }) => theme.spacing.md};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const CoordToggle = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary.main};
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  margin-bottom: ${({ theme }) => theme.spacing.sm};

  &:hover {
    text-decoration: underline;
  }
`;

const CoordRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const CoordInput = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text.primary};
  font-size: 14px;
  font-family: ${({ theme }) => theme.fonts.mono};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Summary = styled.div`
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text.secondary};

  & > div {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
  }
`;

const SummaryLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
`;

const SummaryValue = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text.primary};
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.danger};
  font-size: 12px;
  margin-bottom: ${({ theme }) => theme.spacing.sm};
`;

const Hint = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-top: -${({ theme }) => theme.spacing.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ConnectedBadge = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.muted};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  display: block;
`;

// ============================================================
// Component
// ============================================================

interface Props {
  tribeId: string;
  tlkBytes: Uint8Array;
  tlkVersion: number;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = "select" | "confirm";

export function RegisterNetworkNodeLocationModal({
  tribeId,
  tlkBytes,
  tlkVersion,
  onClose,
  onSuccess,
}: Props) {
  const { structures, isLoading: structuresLoading } = useMyStructures();
  const { submitNetworkNodePod } = useLocationPods();

  const [step, setStep] = useState<Step>("select");
  const [networkNodeId, setNetworkNodeId] = useState("");
  const [solarSystem, setSolarSystem] = useState<SolarSystemEntry | null>(null);
  const [showCoords, setShowCoords] = useState(false);
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [z, setZ] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ structureCount: number } | null>(null);

  // Filter to only Network Nodes
  const networkNodes = useMemo(
    () => structures.filter((s) => s.typeId === NETWORK_NODE_TYPE_ID),
    [structures],
  );

  // Fetch Network Node data for connected assembly counts
  const networkNodeIds = useMemo(
    () => networkNodes.map((n) => n.id),
    [networkNodes],
  );
  const { nodes: networkNodeData } = useNetworkNodes(networkNodeIds);

  const selectedNode = networkNodes.find((n) => n.id === networkNodeId);
  const selectedNodeData = networkNodeId ? networkNodeData.get(networkNodeId) : null;
  const connectedCount = selectedNodeData?.connectedAssemblyCount ?? 0;
  const canProceed = !!networkNodeId && !!solarSystem;

  async function handleSubmit() {
    if (!solarSystem || !networkNodeId) return;
    setSubmitting(true);
    setError(null);

    const location: LocationData = {
      solarSystemId: solarSystem.id,
      x: Number(x) || 0,
      y: Number(y) || 0,
      z: Number(z) || 0,
    };

    try {
      const res = await submitNetworkNodePod({
        networkNodeId,
        tribeId,
        location,
        tlkBytes,
        tlkVersion,
      });
      setResult(res);
      onSuccess();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit location";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Register Network Node Location" onClose={onClose} disableClose={submitting}>
      {step === "select" && (
        <>
          {/* Network Node picker */}
          <Label>Network Node</Label>
          {structuresLoading ? (
            <Select disabled>
              <option>Loading…</option>
            </Select>
          ) : networkNodes.length === 0 ? (
            <>
              <Select disabled>
                <option>No Network Nodes found</option>
              </Select>
              <Hint>
                You need to own at least one Network Node structure to register a location.
              </Hint>
            </>
          ) : (
            <Select
              value={networkNodeId}
              onChange={(e) => setNetworkNodeId(e.target.value)}
            >
              <option value="">Select a Network Node…</option>
              {networkNodes.map((n) => {
                const nodeData = networkNodeData.get(n.id);
                const count = nodeData?.connectedAssemblyCount ?? 0;
                return (
                  <option key={n.id} value={n.id}>
                    {n.name || "Network Node"} — {truncateAddress(n.id, 8, 6)}
                    {count > 0 ? ` (${count} connected)` : ""}
                  </option>
                );
              })}
            </Select>
          )}

          {networkNodeId && (
            <ConnectedBadge>
              {connectedCount} structure{connectedCount !== 1 ? "s" : ""} connected
              — all will receive derived location PODs
            </ConnectedBadge>
          )}

          {/* Solar system picker */}
          <Label>Solar System</Label>
          <SolarSystemPicker
            value={solarSystem?.id ?? null}
            onChange={(entry) => {
              setSolarSystem(entry);
              if (entry) {
                setX(entry.x.toString());
                setY(entry.y.toString());
                setZ(entry.z.toString());
                setShowCoords(true);
              } else {
                setX("0");
                setY("0");
                setZ("0");
                setShowCoords(false);
              }
            }}
          />
          <Hint>
            Start typing a system name. Coordinates default to (0, 0, 0) — the
            solar system alone is sufficient for most use cases.
          </Hint>

          {/* Optional coordinates */}
          <CoordToggle
            type="button"
            onClick={() => setShowCoords((v) => !v)}
          >
            {showCoords ? "▾ Hide exact coordinates" : "▸ Advanced: exact coordinates"}
          </CoordToggle>
          {showCoords && (
            <CoordRow>
              <div>
                <Label>X</Label>
                <CoordInput
                  type="number"
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                />
              </div>
              <div>
                <Label>Y</Label>
                <CoordInput
                  type="number"
                  value={y}
                  onChange={(e) => setY(e.target.value)}
                />
              </div>
              <div>
                <Label>Z</Label>
                <CoordInput
                  type="number"
                  value={z}
                  onChange={(e) => setZ(e.target.value)}
                />
              </div>
            </CoordRow>
          )}

          <ButtonRow>
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton
              disabled={!canProceed}
              onClick={() => setStep("confirm")}
            >
              Review
            </PrimaryButton>
          </ButtonRow>
        </>
      )}

      {step === "confirm" && solarSystem && (
        <>
          <Summary>
            <div>
              <SummaryLabel>Network Node</SummaryLabel>
              <SummaryValue>
                {selectedNode?.name || truncateAddress(networkNodeId, 10, 6)}
              </SummaryValue>
            </div>
            <div>
              <SummaryLabel>Connected Structures</SummaryLabel>
              <SummaryValue>{connectedCount}</SummaryValue>
            </div>
            <div>
              <SummaryLabel>Solar System</SummaryLabel>
              <SummaryValue>
                {solarSystemName(solarSystem.id)}
              </SummaryValue>
            </div>
            <div>
              <SummaryLabel>Coordinates</SummaryLabel>
              <SummaryValue>
                ({Number(x) || 0}, {Number(y) || 0}, {Number(z) || 0})
              </SummaryValue>
            </div>
            <div>
              <SummaryLabel>TLK Version</SummaryLabel>
              <SummaryValue>v{tlkVersion}</SummaryValue>
            </div>
          </Summary>

          <Hint>
            Your wallet will be prompted to sign the POD. The location will be
            encrypted with the Tribe Location Key and derived to all{" "}
            {connectedCount} connected structure{connectedCount !== 1 ? "s" : ""}.
          </Hint>

          {error && <ErrorText>{error}</ErrorText>}

          <ButtonRow>
            <SecondaryButton onClick={() => setStep("select")} disabled={submitting}>
              Back
            </SecondaryButton>
            <PrimaryButton onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Signing & Encrypting…" : "Register Network Node"}
            </PrimaryButton>
          </ButtonRow>
        </>
      )}
    </Modal>
  );
}
