/**
 * Failing stubs for the react-upgrade feature.
 * These tests assert the target post-upgrade state and fail on the pre-upgrade stack.
 * All should pass once package.json is updated and npm install has run.
 */
import React from "react";
import reactPkg from "react/package.json";
import r3fPkg from "@react-three/fiber/package.json";
import dreiPkg from "@react-three/drei/package.json";

describe("react-upgrade: dependency version targets", () => {
  it("React is version 19.x", () => {
    const major = parseInt(reactPkg.version.split(".")[0], 10);
    expect(major).toBe(19);
  });

  it("@react-three/fiber is version 9.x", () => {
    const major = parseInt(r3fPkg.version.split(".")[0], 10);
    expect(major).toBe(9);
  });

  it("@react-three/drei is version 10.x", () => {
    const major = parseInt(dreiPkg.version.split(".")[0], 10);
    expect(major).toBe(10);
  });
});

describe("react-upgrade: React 19 API surface", () => {
  it("React.use() is available (React 19 addition)", () => {
    // React.use() is a new hook introduced in React 19 for reading context/promises
    expect(typeof (React as { use?: unknown }).use).toBe("function");
  });

  it("React.version reflects the installed version", () => {
    // Belt-and-suspenders: package.json version and runtime version agree
    expect(React.version).toBe(reactPkg.version);
  });
});
