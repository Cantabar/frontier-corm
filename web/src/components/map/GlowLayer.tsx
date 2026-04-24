import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useMapContext } from "../../contexts/MapContext";

const MIN_PIXEL_SIZE = 3;

export function GlowLayer() {
  const { positions, glowMask, densityOpacity, overlayColors, glowRadiusLy } = useMapContext();

  const texture = useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, "rgba(255,255,255,1)");
    g.addColorStop(0.7, "rgba(255,255,255,1)");
    g.addColorStop(1.0, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }, []);

  useEffect(() => () => { texture.dispose(); }, [texture]);

  const geometry = useMemo(() => {
    if (!glowMask) return null;
    const qualifying: number[] = [];
    for (let i = 0; i < glowMask.length; i++) {
      if (glowMask[i] > 0.5) qualifying.push(i);
    }
    const N = qualifying.length;
    if (N === 0) return null;

    const posBuf = new Float32Array(N * 3);
    const colBuf = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const gi = qualifying[i];
      posBuf[i * 3]     = positions[gi * 3];
      posBuf[i * 3 + 1] = positions[gi * 3 + 1];
      posBuf[i * 3 + 2] = positions[gi * 3 + 2];
      if (overlayColors) {
        colBuf[i * 3]     = overlayColors[gi * 3];
        colBuf[i * 3 + 1] = overlayColors[gi * 3 + 1];
        colBuf[i * 3 + 2] = overlayColors[gi * 3 + 2];
      } else {
        colBuf[i * 3] = colBuf[i * 3 + 1] = colBuf[i * 3 + 2] = 1;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posBuf, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colBuf, 3));
    return geo;
  }, [positions, glowMask, overlayColors]);

  useEffect(() => {
    return () => { geometry?.dispose(); };
  }, [geometry]);

  const material = useMemo(() => {
    const mat = new THREE.PointsMaterial({
      size:             glowRadiusLy,
      sizeAttenuation:  true,
      vertexColors:     true,
      map:              texture,
      transparent:      true,
      depthWrite:       false,
      blending:         THREE.CustomBlending,
      blendEquation:    THREE.MaxEquation,
      // WebGL ignores blend factors under MaxEquation (spec), so these are
      // inert; opacity is applied inside the fragment shader below instead.
      blendSrc:         THREE.OneFactor,
      blendDst:         THREE.OneFactor,
      opacity:          densityOpacity,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uMinPixels = { value: MIN_PIXEL_SIZE };
      shader.vertexShader = "uniform float uMinPixels;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <fog_vertex>",
        "#include <fog_vertex>\n  gl_PointSize = max(gl_PointSize, uMinPixels);",
      );
      // Bake opacity into the output RGB. MaxEquation ignores blendSrc/Dst,
      // so opacity only affecting alpha leaves the slider visually inert.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        "gl_FragColor = vec4( outgoingLight * opacity, diffuseColor.a );",
      );
    };
    return mat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture]);

  useEffect(() => {
    material.size = glowRadiusLy;
  }, [material, glowRadiusLy]);

  useEffect(() => {
    material.opacity = densityOpacity;
  }, [material, densityOpacity]);

  useEffect(() => () => { material.dispose(); }, [material]);

  if (!geometry) return null;
  return <points geometry={geometry} material={material} />;
}
