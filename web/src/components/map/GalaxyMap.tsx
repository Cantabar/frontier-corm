import { useState, useEffect, type ReactNode, type ComponentProps } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SolarSystemPoints } from "./SolarSystemPoints";
import { SelectionIndicator } from "./SelectionIndicator";

// R3F v8 + React 18 StrictMode: unmountComponentAtNode calls forceContextLoss()
// after a 500 ms delay, and the stale root.current ref on the Canvas prevents a
// fresh root from being created on the simulated remount — leaving the map blank.
// Delaying the Canvas mount via setTimeout(0) means the first timer is always
// cancelled by StrictMode's cleanup before it fires; only the second (stable)
// setup's timer completes, so the Canvas mounts exactly once with a clean root.
function StrictSafeCanvas({ children, ...props }: ComponentProps<typeof Canvas>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => {
      clearTimeout(id);
      setMounted(false);
    };
  }, []);
  if (!mounted) return <div style={{ width: "100%", height: "100%" }} />;
  return <Canvas {...props}>{children}</Canvas>;
}

interface GalaxyMapProps {
  positions: Float32Array;
  ids: number[];
  idToIndex: Map<number, number>;
  selectedId: number | null;
  onSelect: (id: number) => void;
  sceneOverlays?: ReactNode;
  hudOverlays?: ReactNode;
}

export function GalaxyMap({
  positions,
  ids,
  idToIndex,
  selectedId,
  onSelect,
  sceneOverlays,
  hudOverlays,
}: GalaxyMapProps) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <StrictSafeCanvas camera={{ position: [0, 0, 15000], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <OrbitControls enableDamping />
        <SolarSystemPoints positions={positions} ids={ids} onSelect={onSelect} />
        <SelectionIndicator
          positions={positions}
          idToIndex={idToIndex}
          selectedId={selectedId}
        />
        {sceneOverlays}
      </StrictSafeCanvas>
      {hudOverlays}
    </div>
  );
}
