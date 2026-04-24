import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMapContext } from "../../contexts/MapContext";
import { buildAreaShapes } from "../../lib/areaClusters";

export function AreaFillLayer() {
  const {
    positions,
    categoryKeys,
    overlayColors,
    densityOpacity,
    deferredAreaDiscoveryDistanceLy,
  } = useMapContext();

  const { hullVertexPositions, hullVertexColors } = useMemo(() => {
    if (!categoryKeys || !overlayColors) {
      return {
        hullVertexPositions: new Float32Array(0),
        hullVertexColors: new Float32Array(0),
      };
    }
    return buildAreaShapes({
      positions,
      categoryKeys,
      overlayColors,
      discoveryDistanceLy: deferredAreaDiscoveryDistanceLy,
    });
  }, [positions, categoryKeys, overlayColors, deferredAreaDiscoveryDistanceLy]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    if (hullVertexPositions.length > 0) {
      geo.setAttribute("position", new THREE.BufferAttribute(hullVertexPositions, 3));
      geo.setAttribute("color",    new THREE.BufferAttribute(hullVertexColors, 3));
    }
    return geo;
  }, [hullVertexPositions, hullVertexColors]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);

  const material = useMemo(() => new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    opacity: densityOpacity,
  }), []);
  useEffect(() => () => { material.dispose(); }, [material]);
  useEffect(() => { material.opacity = densityOpacity; }, [material, densityOpacity]);

  if (hullVertexPositions.length === 0) return null;
  return <mesh geometry={geometry} material={material} frustumCulled={false} />;
}
