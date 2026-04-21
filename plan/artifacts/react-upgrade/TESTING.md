# Testing: React 19 Upgrade

## Automated Test Results

| Package | Suite | Total | Pass | Fail | Skip |
|---|---|---|---|---|---|
| `web` | vitest (unit + component) | 35 | 35 | 0 | 0 |
| `web` | Playwright E2E | 7 | 7 | 0 | 0 |

## Acceptance Criteria Coverage

| Criterion | Covered by | Status |
|---|---|---|
| `react` and `react-dom` at `19.2.5` | `upgrade.test.ts` — "React is version 19.x" | PASS |
| `@react-three/fiber` at v9.x | `upgrade.test.ts` — "@react-three/fiber is version 9.x" | PASS |
| `@react-three/drei` at v10.x | `upgrade.test.ts` — "@react-three/drei is version 10.x" | PASS |
| React 19 `use()` API present | `upgrade.test.ts` — "React.use() is available" | PASS |
| Other peer deps at React-19-compatible versions | `npm install` resolved clean; no `--legacy-peer-deps` | PASS |
| `vitest run` passes | 35/35 automated | PASS |
| `playwright test` passes (incl. map E2E) | 7/7 automated | PASS |
| `vite build` exits 0 | Build confirmed clean (no errors, 2 pre-existing warnings) | PASS |
| `tsc -b` / `typecheck` exits 0 | Type check clean | PASS |
| Galaxy Map canvas renders in dev server | Manual checklist item | UNCHECKED |
| No React/r3f deprecation warnings on map page | Manual checklist item | UNCHECKED |

## Manual Testing Checklist

### 1. Galaxy Map — StrictMode canvas render (dev server)
1. Run `npm run dev` inside `web/`
2. Navigate to the Galaxy Map page
3. Open the browser DevTools console before navigating
4. Wait 2 seconds
**Expected:** The 3D star-field canvas is visible and fully rendered. No "WebGL context lost", "forceContextLoss", or blank canvas. No React errors in the console.

### 2. Galaxy Map — OrbitControls respond (dev server)
1. With the Galaxy Map open, click and drag on the canvas
**Expected:** The camera orbits (the star field rotates). No crash or freeze.

### 3. Galaxy Map — Solar system selection (dev server)
1. Click on a visible star/point in the galaxy map
**Expected:** The SystemInfoPanel appears on the right side showing the selected system's name and details.

### 4. Galaxy Map — scroll-wheel zoom (dev server)
1. Hover over the canvas and scroll the mouse wheel
**Expected:** The camera zooms in and out smoothly.

### 5. Wallet connect flow
1. Navigate to the Dashboard or any page with the wallet button
2. Click "Connect Wallet"
3. Select a wallet provider
**Expected:** Wallet connection modal opens; after connecting, the wallet address appears in the UI. No console errors mentioning `@mysten/dapp-kit` or `@mysten/sui`.

### 6. Continuity Engine iframe
1. Navigate to the Continuity Engine page
**Expected:** The embedded iframe loads the Go service UI without errors.

### 7. Shadow Location Network encryption (regression)
The `locationCrypto.ts` changes are cryptographic — the API renames must produce identical outputs. This cannot be unit-tested without a live Sui connection.
1. If a test network environment is available: create a new Shadow Location entry and verify it can be retrieved and decrypted correctly
2. At minimum: check the browser console for any import or runtime errors on pages that use location features (Locations page)
**Expected:** No import errors (`ERR_MODULE_NOT_FOUND` on `@noble/curves/ed25519` or `@noble/hashes/blake2b` would indicate the old paths slipped back in).

## Regression Surface

These files were modified and are used by code paths beyond the immediate feature:

| File | Used by | Risk |
|---|---|---|
| `web/src/main.tsx` | App entrypoint — affects all pages | `getJsonRpcFullnodeUrl` rename and `network` field; if wrong, wallet and Sui RPC calls fail on all pages |
| `web/src/lib/locationCrypto.ts` | Shadow Location Network (Locations page, location creation/retrieval) | Cryptographic API renames — code review confirmed semantically identical, but should be smoke-tested with a live key exchange |
| `web/src/hooks/useSsuInventory.ts` | SSU (Storage Unit) inventory queries | Blake2b hash rename — same output confirmed, but verify SSU inventory loads on the relevant page |
| `web/src/components/shared/SolarSystemPicker.tsx` | Used in any form/page with a solar system picker | `useRef(undefined)` change is cosmetic/type-only — no behavioral risk |

## Type Check

| Package | Command | Result |
|---|---|---|
| `web` | `npm run typecheck` (`tsc --noEmit -p tsconfig.app.json`) | Clean — 0 errors |

## Code Review

```
## Code Review: React 19 Upgrade

### 1. SPEC COMPLIANCE
No out-of-scope changes found. Every change is either a direct dependency version bump or a 
forced API migration caused by the major version upgrades. The scope is clean.

### 2. CODE QUALITY

NON-BLOCKING — React version pinned without comment explaining <19.3 constraint
react and react-dom are pinned to exact "19.2.5" (no ^) while all other dependencies use 
caret ranges. This is intentional: @react-three/fiber@9.6.0 declares react: ">=19 <19.3", 
so 19.2.5 is the last compatible patch before the upper bound. The pin is correct but 
undocumented — a future developer will wonder why these two are pinned differently.

NON-BLOCKING — build script uses tsc -b (includes test types) rather than tsconfig.app.json
tsconfig.app.json is only wired to the typecheck script. The build script still runs tsc -b 
which resolves to tsconfig.json, which includes src/test-setup.ts and therefore pulls in 
vitest/globals types into the production type pass. This does not cause a build failure today 
(skipLibCheck: true; vitest is installed), but the intended isolation between app and test type 
environments is incomplete. The build script should use tsc -b tsconfig.app.json, or tsconfig.json 
itself should grow the same exclude list. Latent hygiene issue, not a correctness bug today.

PASS — useRef<ReturnType<typeof setTimeout>>(undefined)
React 19 tightened useRef: calling useRef() with no argument returns RefObject<T> (read-only), 
while useRef(initialValue) returns MutableRefObject<T>. Passing undefined explicitly is the 
correct migration to keep the mutable form.

PASS — network field in createNetworkConfig
SuiJsonRpcClientOptions.network is confirmed required in @mysten/sui@2.16.0 type definitions. 
All three network entries have it. Correct.

PASS — No stale old API calls remain
Searched src/ for getFullnodeUrl, randomPrivateKey, edwardsToMontgomeryPub, blake2b.js (old 
path): zero hits. Migration is complete.

### 3. CRYPTOGRAPHIC CORRECTNESS

PASS — randomPrivateKey → randomSecretKey (x25519.utils)
randomPrivateKey no longer exists in @noble/curves@2.2.0. Both functions return a 
cryptographically random 32-byte Uint8Array suitable as an X25519 private key. Pure rename 
with identical semantics. Confirmed by runtime inspection.

PASS — edwardsToMontgomeryPub → ed25519.utils.toMontgomery
The same birational map (Edwards → Montgomery): u = (1 + y) / (1 - y) mod p. Confirmed both 
by reading the source in node_modules/@noble/curves/src/abstract/edwards.ts and a runtime 
cross-check. Semantically identical.

PASS — @noble/hashes/blake2b → @noble/hashes/blake2.js
The old blake2b subpath no longer exists in @noble/hashes@2.2.0 (would cause 
ERR_MODULE_NOT_FOUND at runtime). The new blake2.js exports blake2b with the same call 
signature. A runtime hash of identical input produces identical output from both modules. 
The rename is correct.

NON-BLOCKING — ed25519 import is broader than needed
locationCrypto.ts imports the entire ed25519 object to access only ed25519.utils.toMontgomery. 
Not a security issue — tree-shaker handles it. No action required.

BLOCKING findings: 0
NON-BLOCKING findings: 3
```

## Summary

All automated tests pass: 35/35 vitest (including 4 upgrade-gate stubs that were previously failing against React 18/r3f v8) and 7/7 Playwright E2E including the full Galaxy Map canvas suite. TypeScript compiles clean. The code review found no blocking issues; the two structural non-blocking items are (1) React/react-dom pinned without a comment explaining the r3f `<19.3` upper bound, and (2) the `build` script still invokes `tsc -b` against the base tsconfig rather than `tsconfig.app.json`. Two manual checklist items remain unchecked: dev-server canvas render under React 19 StrictMode, and live Shadow Location Network key exchange verification. The `StrictSafeCanvas` wrapper was deliberately retained — r3f v9.6.0 source inspection confirmed the `forceContextLoss()` / 500ms timer bug is structurally unchanged.
