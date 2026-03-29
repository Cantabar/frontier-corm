/**
 * Modal for reviewing and copying a shareable POD proof bundle.
 *
 * Fetches the proof bundle from the indexer (public POD metadata + ZK proofs
 * + location tags) and presents it in a readable format. The user can copy
 * the full JSON to share with external applications.
 */

import { useState, useEffect } from "react";
import styled from "styled-components";
import { Modal } from "../shared/Modal";
import { PrimaryButton, SecondaryButton } from "../shared/Button";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { CopyableId } from "../shared/CopyableId";
import { getLocationPodProof, type PodProofBundle } from "../../lib/api";
import { truncateAddress } from "../../lib/format";

// ============================================================
// Styled primitives
// ============================================================

const Section = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.h3`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const FieldRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 3px 0;
  font-size: 13px;
`;

const FieldLabel = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
  flex-shrink: 0;
  margin-right: ${({ theme }) => theme.spacing.sm};
`;

const FieldValue = styled.span`
  color: ${({ theme }) => theme.colors.text.primary};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 12px;
  text-align: right;
  word-break: break-all;
`;

const ProofBlock = styled.div`
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: 12px;
`;

const ProofLabel = styled.span`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text.secondary};
`;

const ProofMeta = styled.span`
  color: ${({ theme }) => theme.colors.text.muted};
  font-size: 11px;
  margin-left: ${({ theme }) => theme.spacing.sm};
`;

const TagBadge = styled.span`
  display: inline-block;
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 2px 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.secondary};
  margin-right: ${({ theme }) => theme.spacing.xs};
  margin-bottom: ${({ theme }) => theme.spacing.xs};
`;

const JsonPreview = styled.pre`
  background: ${({ theme }) => theme.colors.surface.bg};
  border: 1px solid ${({ theme }) => theme.colors.surface.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: ${({ theme }) => theme.spacing.md};
  font-family: ${({ theme }) => theme.fonts.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.colors.text.secondary};
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const ButtonRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: flex-end;
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.colors.danger};
  font-size: 12px;
  padding: ${({ theme }) => theme.spacing.sm} 0;
`;

const EmptyNote = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.text.muted};
  font-style: italic;
  padding: 2px 0;
`;

// ============================================================
// Component
// ============================================================

interface Props {
  structureId: string;
  tribeId: string;
  getAuthHeader: () => Promise<string>;
  onClose: () => void;
}

type View = "details" | "json";

export function PodProofModal({
  structureId,
  tribeId,
  getAuthHeader,
  onClose,
}: Props) {
  const [bundle, setBundle] = useState<PodProofBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<View>("details");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const authHeader = await getAuthHeader();
        const result = await getLocationPodProof(structureId, tribeId, authHeader);
        if (!cancelled) setBundle(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load proof bundle");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [structureId, tribeId, getAuthHeader]);

  function handleCopy() {
    if (!bundle) return;
    const json = JSON.stringify(bundle, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Modal title="Location Proof" onClose={onClose}>
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorText>{error}</ErrorText>
      ) : bundle ? (
        <>
          {/* View toggle */}
          <Section>
            <SecondaryButton
              onClick={() => setView(view === "details" ? "json" : "details")}
              style={{ padding: "2px 10px", fontSize: "11px" }}
            >
              {view === "details" ? "Show JSON" : "Show Details"}
            </SecondaryButton>
          </Section>

          {view === "details" ? (
            <>
              {/* Core attestation fields */}
              <Section>
                <SectionTitle>Attestation</SectionTitle>
                <FieldRow>
                  <FieldLabel>Structure</FieldLabel>
                  <FieldValue><CopyableId id={bundle.structure_id} asCode /></FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Owner</FieldLabel>
                  <FieldValue><CopyableId id={bundle.owner_address} asCode /></FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Tribe</FieldLabel>
                  <FieldValue><CopyableId id={bundle.tribe_id} asCode /></FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Location Hash</FieldLabel>
                  <FieldValue>{truncateAddress(bundle.location_hash, 10, 8)}</FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Signature</FieldLabel>
                  <FieldValue>{truncateAddress(bundle.signature, 10, 8)}</FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Version</FieldLabel>
                  <FieldValue>POD v{bundle.pod_version} / TLK v{bundle.tlk_version}</FieldValue>
                </FieldRow>
                <FieldRow>
                  <FieldLabel>Created</FieldLabel>
                  <FieldValue>{new Date(bundle.created_at).toLocaleString()}</FieldValue>
                </FieldRow>
              </Section>

              {/* ZK Proofs */}
              <Section>
                <SectionTitle>ZK Proofs ({bundle.zk_proofs.length})</SectionTitle>
                {bundle.zk_proofs.length === 0 ? (
                  <EmptyNote>No ZK proofs submitted for this structure yet.</EmptyNote>
                ) : (
                  bundle.zk_proofs.map((p, i) => (
                    <ProofBlock key={i}>
                      <ProofLabel>{p.filter_type}</ProofLabel>
                      <ProofMeta>{p.filter_key}</ProofMeta>
                      <ProofMeta>· verified {new Date(p.verified_at).toLocaleDateString()}</ProofMeta>
                    </ProofBlock>
                  ))
                )}
              </Section>

              {/* Location Tags */}
              <Section>
                <SectionTitle>Location Tags ({bundle.location_tags.length})</SectionTitle>
                {bundle.location_tags.length === 0 ? (
                  <EmptyNote>No public location tags for this structure.</EmptyNote>
                ) : (
                  <div>
                    {bundle.location_tags.map((t, i) => (
                      <TagBadge key={i}>
                        {t.tag_type} #{t.tag_id}
                      </TagBadge>
                    ))}
                  </div>
                )}
              </Section>
            </>
          ) : (
            <JsonPreview>{JSON.stringify(bundle, null, 2)}</JsonPreview>
          )}

          {/* Actions */}
          <ButtonRow>
            <SecondaryButton onClick={onClose}>Close</SecondaryButton>
            <PrimaryButton onClick={handleCopy}>
              {copied ? "Copied ✓" : "Copy Proof"}
            </PrimaryButton>
          </ButtonRow>
        </>
      ) : null}
    </Modal>
  );
}
