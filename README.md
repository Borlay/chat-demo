# chat-demo

A messaging demo running fully on the Internet Computer (ICP).

## Structure

- `src/management/` – Motoko management canister. Responsible for deploying and managing the other canisters.
- `src/messages/` – Motoko backend canister for chat messages.
- `src/frontend/` – React + Vite frontend, deployed as an ICP asset canister.

## Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install/) (DFINITY SDK)
- Node.js 18+

## Local development

```bash
# 1. Install frontend deps
cd src/frontend && npm install && cd ../..

# 2. Start a local replica
dfx start --background --clean

# 3. Build the frontend
cd src/frontend && npm run build && cd ../..

# 4. Deploy all canisters locally
dfx deploy
```
