interface SelectionIndicatorProps {
  positions: Float32Array;
  idToIndex: Map<number, number>;
  selectedId: number | null;
}

export function SelectionIndicator({ positions, idToIndex, selectedId }: SelectionIndicatorProps) {
  if (selectedId === null) return null;

  const idx = idToIndex.get(selectedId);
  if (idx === undefined) return null;

  const x = positions[idx * 3];
  const y = positions[idx * 3 + 1];
  const z = positions[idx * 3 + 2];

  return (
    <mesh position={[x, y, z]}>
      <sphereGeometry args={[1.5, 8, 8]} />
      <meshBasicMaterial color="#ffff00" />
    </mesh>
  );
}
