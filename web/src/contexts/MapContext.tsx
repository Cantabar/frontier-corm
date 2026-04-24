import { createContext, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import * as THREE from "three";
import { buildGalaxyBuffer } from "../lib/galaxyMap";
import { SOLAR_SYSTEMS } from "../lib/solarSystems";
import { useOverlayColors } from "../hooks/useOverlayColors";
import { useLocationPods } from "../hooks/useLocationPods";
import type { DecryptedPod } from "../hooks/useLocationPods";
import type { OverlayConfig } from "../lib/overlayTypes";
import { mapRenderBridge } from "../lib/mapRenderBridge";

type SidebarTab = "system" | "overlays";

const GOLD_R = 1;
const GOLD_G = 0.84;
const GOLD_B = 0;

interface MapContextValue {
  positions: Float32Array;
  ids: number[];
  idToIndex: Map<number, number>;

  sidebarTab: SidebarTab;
  setSidebarTab: (tab: SidebarTab) => void;

  selectedId: number | null;
  setSelectedId: (id: number | null) => void;

  overlayConfig: OverlayConfig | null;
  setOverlayConfig: (cfg: OverlayConfig | null) => void;
  pods: DecryptedPod[];

  densityOpacity: number;
  setDensityOpacity: (opacity: number) => void;

  glowRadiusLy: number;
  setGlowRadiusLy: (ly: number) => void;

  areaDiscoveryDistanceLy: number;
  setAreaDiscoveryDistanceLy: (ly: number) => void;
  /** Debounced version of `areaDiscoveryDistanceLy` — use for heavy recomputes that lag slider drag. */
  deferredAreaDiscoveryDistanceLy: number;

  overlayColors: Float32Array | null;
  glowMask: Float32Array | null;
  densityMask: Float32Array | null;
  categoryKeys: Int32Array | null;

  finalStarColors: Float32Array;
}

export const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error("useMapContext must be used inside <MapProvider>");
  return ctx;
}

export function MapProvider({ children }: { children: ReactNode }) {
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("system");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig | null>(null);
  const [densityOpacity, setDensityOpacity] = useState<number>(0.15);
  const [glowRadiusLy, setGlowRadiusLy] = useState<number>(20);
  const [areaDiscoveryDistanceLy, setAreaDiscoveryDistanceLy] = useState<number>(50);
  const deferredAreaDiscoveryDistanceLy = useDeferredValue(areaDiscoveryDistanceLy);

  const { positions, ids, idToIndex } = useMemo(
    () => buildGalaxyBuffer(Array.from(SOLAR_SYSTEMS.values())),
    [],
  );

  const { pods } = useLocationPods();

  const { colors: overlayColors, glowMask, densityMask, categoryKeys } = useOverlayColors({
    overlayConfig,
    ids,
    pods,
  });

  const tintStarsByOverlay =
    overlayConfig !== null && overlayConfig.mode === "color";

  const finalStarColors = useMemo<Float32Array>(() => {
    const N = ids.length;
    const buf = new Float32Array(N * 3);
    if (overlayColors && tintStarsByOverlay) {
      buf.set(overlayColors);
    } else {
      buf.fill(1);
    }
    if (selectedId !== null) {
      const idx = idToIndex.get(selectedId);
      if (idx !== undefined) {
        buf[idx * 3]     = GOLD_R;
        buf[idx * 3 + 1] = GOLD_G;
        buf[idx * 3 + 2] = GOLD_B;
      }
    }
    return buf;
  }, [overlayColors, tintStarsByOverlay, selectedId, idToIndex, ids.length]);

  useLayoutEffect(() => {
    mapRenderBridge.finalStarColors = finalStarColors;
    mapRenderBridge.colorsDirty = true;
  }, [finalStarColors]);

  useLayoutEffect(() => {
    mapRenderBridge.glowMask = glowMask;
    mapRenderBridge.overlayColors = overlayColors;
    mapRenderBridge.glowDirty = true;
  }, [glowMask, overlayColors]);

  const value: MapContextValue = {
    positions,
    ids,
    idToIndex,
    sidebarTab,
    setSidebarTab,
    selectedId,
    setSelectedId,
    overlayConfig,
    setOverlayConfig,
    pods,
    densityOpacity,
    setDensityOpacity,
    glowRadiusLy,
    setGlowRadiusLy,
    areaDiscoveryDistanceLy,
    setAreaDiscoveryDistanceLy,
    deferredAreaDiscoveryDistanceLy,
    overlayColors,
    glowMask,
    densityMask,
    categoryKeys,
    finalStarColors,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
