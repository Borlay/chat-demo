# Copilot instructions for chat-demo

This repository is a demo messaging app that runs **entirely on the Internet
Computer (ICP)**. Follow these rules when generating or modifying code.

## Project layout

- `src/management/` – Motoko management canister. Responsible for deploying and
  managing the other canisters.
- `src/messages/` – Motoko backend canister for chat messages.
- `src/users/` – Motoko canister storing registered users (principal +
  full name).
- `src/frontend/` – React + Vite + TypeScript app, deployed as an ICP asset
  canister.
- `dfx.json` – declares all canisters, including the pulled-in
  `internet_identity` canister.

## Motoko rules

- **Only use `mo:core` libraries. Never import from `mo:base`.**
  - `Principal` → `mo:core/Principal`
  - Maps → `mo:core/Map` (ordered map, stable-safe inside
    `persistent actor`; use `Principal.compare` / `Text.compare` for keys).
  - `Text`, `Time`, `Nat`, etc. → `mo:core/*`.
- Prefer `persistent actor` with plain `var` fields over manual
  `preupgrade`/`postupgrade` hooks. `mo:core` collections (`Map`, `Set`,
  `List`) are stable-compatible and don't need migration entries.
- Use `shared ({ caller })` for authenticated endpoints. Reject
  `Principal.isAnonymous(caller)` where registration / identity is required.
- Return `{ #ok : T; #err : Text }` variants for fallible update calls;
  return `?T` for lookup queries.
- Keep each canister focused on a single responsibility. Cross-canister work
  goes through the `management` canister where appropriate.

## Frontend rules

- Stack: **React 18 + Vite + TypeScript** (strict mode). No other frameworks.
- Authentication uses **Internet Identity** via `@dfinity/auth-client`. II's
  own consent screen provides the Google sign-in option — do **not** add a
  separate Google OAuth flow.
- Canister IDs come from the repo-root `.env` file written by `dfx deploy`,
  surfaced to the app as `import.meta.env.VITE_CANISTER_ID_*` and
  `VITE_DFX_NETWORK` (see `src/frontend/vite.config.ts`).
- Build actors with `@dfinity/agent`'s `HttpAgent` + `Actor.createActor`.
  Call `agent.fetchRootKey()` **only** when `VITE_DFX_NETWORK !== "ic"`.
- Keep Candid IDL factories + TS types colocated in
  `src/frontend/src/canisters/<canister>.ts` (hand-written, matching the
  Motoko actor's public interface).
- Auth state lives in `AuthContext` with four states:
  `loading | anonymous | authenticated-unregistered | authenticated-registered`.
  Route from `App.tsx` based on that status.
- Keep styling minimal in `src/frontend/src/styles.css`. Don't pull in UI
  libraries unless asked.

## Code style

- 4-space indentation in both Motoko and TS/TSX.
- Don't add docstrings, comments, or type annotations to code you didn't
  change. Don't refactor adjacent code unless requested.
- Don't introduce dependencies without an explicit reason.

## Local workflow

no local deployment

### All the implementations done should be robus, modular and secured
- No simple solutions that has security flaws
- No reliance on frontend checks for security
- Important security validations should be done on backend
- Code should be modular and reusable, no copy paste solutions. Create modules and reusable code where it makes sense
- Prioritize quality and security over speed of development
- Design and implement stuff for high user load from get go, no short cuts for later improvement
- Always treat users as bad actors that can send fake data - so protect app from that, dont trust - validate
- use mo:core instead of mo:base
- use mo:core/Map structure as primary data storage where key:value retrieval is needed
- use HashMap only for cache that can be droped on canister upgrade and doesn't need persistance
- do structural changes if needed, don't optimize for migration or api stability, implement maximal structural changes if that is better long term approach

### Environments
- Currently there are two environment: dev and prod
- Backend is running only on main net, no local environment for backend
- Backend is deployed with github workflows so it has to be maintained, including initialization workflow
- Frontend i may run locally but it uses dev backend on main net
- I develop on windows 11 machine with wsl so use dfx with wsl - but dont localy deploy canisters
