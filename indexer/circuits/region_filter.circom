pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

template AssertInRange(bitSize) {
  signal input value;
  signal input min;
  signal input max;

  component gteMin = LessEqThan(bitSize);
  gteMin.in[0] <== min;
  gteMin.in[1] <== value;
  gteMin.out === 1;

  component lteMax = LessEqThan(bitSize);
  lteMax.in[0] <== value;
  lteMax.in[1] <== max;
  lteMax.out === 1;
}

template RegionFilter(bitSize) {
  // Public inputs
  signal input locationHash;
  signal input regionXMin;
  signal input regionXMax;
  signal input regionYMin;
  signal input regionYMax;
  signal input regionZMin;
  signal input regionZMax;

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

  // Coordinate bounds checks
  component xRange = AssertInRange(bitSize);
  xRange.value <== x;
  xRange.min <== regionXMin;
  xRange.max <== regionXMax;

  component yRange = AssertInRange(bitSize);
  yRange.value <== y;
  yRange.min <== regionYMin;
  yRange.max <== regionYMax;

  component zRange = AssertInRange(bitSize);
  zRange.value <== z;
  zRange.min <== regionZMin;
  zRange.max <== regionZMax;
}

component main {public [
  locationHash,
  regionXMin,
  regionXMax,
  regionYMin,
  regionYMax,
  regionZMin,
  regionZMax
]} = RegionFilter(252);
