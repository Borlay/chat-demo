# chat-demo

A messaging demo running fully on the Internet Computer (ICP).

## Structure

- `src/management/` – Motoko management canister. Provisions and upgrades the
  other canisters via chunked wasm uploads.
- `src/messages/` – Motoko backend canister for chat messages
  (general channel + 1:1 private messages).
- `src/users/` – Motoko canister storing registered users (principal +
  full name) with paginated search.
- `src/frontend/` – React + Vite + TypeScript app, deployed as an ICP asset
  canister. Auth via Internet Identity.

## Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install/)
  (DFINITY SDK, 0.24+)
- Node.js 20+
- [`mops`](https://mops.one) (`npm install -g ic-mops`)

## Local development

```powershell
cd src/frontend; npm install; cd ../..
mops install
dfx start --background --clean
dfx deps pull; dfx deps init; dfx deps deploy
cd src/frontend; npm run build; cd ../..
dfx deploy
```

After `dfx deploy`, the repo-root `.env` contains the canister IDs that Vite
picks up on the next build.

## Deployment to mainnet (CI only)

Mainnet deploys happen exclusively through GitHub Actions — there is no
manual `dfx deploy --network ic` flow. Each push to `dev` triggers
[`.github/workflows/deploy-dev.yml`](.github/workflows/deploy-dev.yml) which:

1. Spins up a local replica just to build the wasms (`users.wasm`,
   `messages.wasm`, `management.wasm`, `assetstorage.wasm.gz`).
2. Installs / upgrades the **management** canister on mainnet via `dfx`.
3. Runs [`scripts/deploy-via-management.mjs`](scripts/deploy-via-management.mjs)
   which chunk-uploads each child wasm to management and asks management to
   `create_canister` + `install_code` for users / messages / frontend.
4. Wires `messages.setUsersCanister(usersId)` so messages can verify
   registration.
5. Rebuilds the frontend with the resolved canister IDs and `dfx deploy`s
   the asset canister to sync static files (the asset wasm is already
   installed by management; CI is added as an additional controller so dfx
   can call asset APIs).

### Required GitHub configuration

For the `dev` environment in this repo:

| kind     | name                     | value                                                                 |
| -------- | ------------------------ | --------------------------------------------------------------------- |
| Secret   | `DFX_IDENTITY_PEM`       | PEM-encoded private key for the CI identity (Ed25519 or Secp256k1).   |
| Variable | `MANAGEMENT_CANISTER_ID` | Mainnet canister id of the management canister (set after first run). |

Generate a fresh identity locally and export the PEM:

```powershell
dfx identity new ci --storage-mode plaintext
dfx identity use ci
dfx identity export ci    # paste output into the DFX_IDENTITY_PEM secret
dfx identity get-principal
```

Top up the resulting principal with cycles (via the [cycles ledger](https://internetcomputer.org/docs/current/developer-docs/defi/cycles/cycles-ledger))
before the first deploy — at least ~5T cycles are needed to create the
management canister and let it create its three children.

### First run

The first time the workflow runs without `MANAGEMENT_CANISTER_ID` set, it
will create the management canister on mainnet and emit a `::warning::` line
with the new id. Copy that id into the `MANAGEMENT_CANISTER_ID` repo
variable so subsequent runs reuse it.

## Tech notes

- Motoko: only `mo:core` libraries are used; `mo:base` is forbidden.
- Persistence uses `persistent actor` with `var` fields backed by
  `mo:core/Map` and `mo:core/List` (stable-safe).
- Authentication uses Internet Identity (II's consent screen exposes Google
  sign-in — no separate OAuth flow).
