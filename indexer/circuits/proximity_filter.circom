pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template ProximityFilter(bitSize) {
  // Public inputs
  signal input locationHash;
  signal input refX;
  signal input refY;
  signal input refZ;
  signal input maxDistanceSquared;

  // Private witness
  signal input x;
  signal input y;
  signal input z;
  signal input salt;

  // Poseidon4(x, y, z, salt) must match the public commitment hash
  component hash = Poseidon(4);
  hash.inputs[0] <== x;
  hash.inputs[1] <== y;
  hash.inputs[2] <== z;
  hash.inputs[3] <== salt;
  hash.out === locationHash;

  // Distance² = (x - refX)² + (y - refY)² + (z - refZ)²
  // Each multiplication is a separate R1CS constraint.
  signal dx <== x - refX;
  signal dy <== y - refY;
  signal dz <== z - refZ;

  signal dxSq <== dx * dx;
  signal dySq <== dy * dy;
  signal dzSq <== dz * dz;
  signal distanceSquared <== dxSq + dySq + dzSq;

  // distanceSquared <= maxDistanceSquared
  component withinDistance = LessEqThan(bitSize);
  withinDistance.in[0] <== distanceSquared;
  withinDistance.in[1] <== maxDistanceSquared;
  withinDistance.out === 1;
}

component main {public [
  locationHash,
  refX,
  refY,
  refZ,
  maxDistanceSquared
]} = ProximityFilter(252);
