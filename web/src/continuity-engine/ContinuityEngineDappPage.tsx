/**
 * Dapp route wrapper — reads :entityId from URL params and passes it
 * to ContinuityEngineDapp.
 */

import { useParams } from "react-router-dom";
import { ContinuityEngineDapp } from "./ContinuityEngine";

export function ContinuityEngineDappPage() {
  const { entityId } = useParams<{ entityId?: string }>();
  return <ContinuityEngineDapp entityId={entityId} />;
}
