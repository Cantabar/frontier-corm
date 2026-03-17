declare module "snarkjs" {
  export namespace groth16 {
    function fullProve(
      input: Record<string, string | string[]>,
      wasmFile: string,
      zkeyFileName: string,
    ): Promise<{ proof: object; publicSignals: string[] }>;

    function verify(
      vkey: object,
      publicSignals: string[],
      proof: object,
    ): Promise<boolean>;

    function exportSolidityCallData(
      proof: object,
      publicSignals: string[],
    ): Promise<string>;
  }

  export namespace plonk {
    function fullProve(
      input: Record<string, string | string[]>,
      wasmFile: string,
      zkeyFileName: string,
    ): Promise<{ proof: object; publicSignals: string[] }>;

    function verify(
      vkey: object,
      publicSignals: string[],
      proof: object,
    ): Promise<boolean>;
  }

  export namespace zKey {
    function exportVerificationKey(
      zkeyFileName: string,
    ): Promise<object>;
  }
}
