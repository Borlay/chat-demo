#!/usr/bin/env node
// Uploads the built child canister wasms to the management canister and asks
// it to (re)install each child canister.
//
// Usage:
//   node scripts/deploy-via-management.mjs \
//       --management <id> [--network ic] [--ci-principal <principal>]
//
// Required env:
//   DFX_IDENTITY_PEM       PEM-encoded identity used to call management
//                          (must be the admin claimed by management).
// Optional env:
//   IC_HOST                Replica host. Defaults to https://icp-api.io.
//
// Output (stdout, JSON):
//   { "users": "...", "messages": "...", "frontend": "..." }

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { argv, env, exit } from "node:process";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { Secp256k1KeyIdentity } from "@dfinity/identity-secp256k1";
import { Principal } from "@dfinity/principal";
import { idlFactory } from "./management.idl.mjs";

const CHUNK_SIZE = 1_500_000; // bytes per uploadWasmChunk call.

// `name` -> path relative to repo root, plus init arg encoder.
const CHILDREN = [
    {
        name: "users",
        wasm: ".dfx/local/canisters/users/users.wasm",
        initArg: () => new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0x00, 0x00]), // "DIDL\0\0" = empty Candid.
        enhancedPersistence: true, // Motoko `persistent actor`.
    },
    {
        name: "messages",
        wasm: ".dfx/local/canisters/messages/messages.wasm",
        initArg: () => new Uint8Array([0x44, 0x49, 0x44, 0x4c, 0x00, 0x00]),
        enhancedPersistence: true, // Motoko `persistent actor`.
    },
    {
        name: "frontend",
        // Asset canister wasm produced by dfx during `dfx build frontend`.
        wasm: ".dfx/local/canisters/frontend/assetstorage.wasm.gz",
        // Asset canister init: `(opt record {})`.
        initArg: () =>
            // DIDL,1 type table entry: opt record {} ; arg type idx 0 ; one optional value present (record {}).
            new Uint8Array([
                0x44, 0x49, 0x44, 0x4c, 0x02, 0x6e, 0x01, 0x6c, 0x00, 0x01,
                0x00, 0x01,
            ]),
        enhancedPersistence: false, // Rust asset canister, no EOP.
    },
];

function parseArgs() {
    const out = {};
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) {
            out[a.slice(2)] = argv[i + 1];
            i++;
        }
    }
    return out;
}

function loadIdentity(pem) {
    const trimmed = pem.trim();
    // Accept either Ed25519 or Secp256k1 PEMs.
    if (trimmed.includes("EC PRIVATE KEY")) {
        return Secp256k1KeyIdentity.fromPem(trimmed);
    }
    return Ed25519KeyIdentity.fromPem(trimmed);
}

async function main() {
    const args = parseArgs();
    const managementId = args.management;
    if (!managementId) {
        console.error("--management <canister-id> is required");
        exit(2);
    }
    const network = args.network ?? "ic";
    const host = env.IC_HOST ?? (network === "local" ? "http://127.0.0.1:4943" : "https://icp-api.io");

    const pem = env.DFX_IDENTITY_PEM;
    if (!pem) {
        console.error("DFX_IDENTITY_PEM env variable is required");
        exit(2);
    }
    const identity = loadIdentity(pem);
    const callerPrincipal = identity.getPrincipal();
    console.error(`Caller principal: ${callerPrincipal.toText()}`);

    const agent = await HttpAgent.create({ host, identity });
    if (network === "local") {
        await agent.fetchRootKey();
    }

    const management = Actor.createActor(idlFactory, {
        agent,
        canisterId: Principal.fromText(managementId),
    });

    const cyclesBalance = await management.cyclesBalance();
    console.error(`Management cycles balance: ${cyclesBalance.toString()}`);

    const additionalControllers = args["ci-principal"]
        ? [Principal.fromText(args["ci-principal"])]
        : [callerPrincipal];

    const result = {};
    for (const child of CHILDREN) {
        const wasmPath = path.resolve(child.wasm);
        if (!existsSync(wasmPath)) {
            console.error(`Wasm not found for ${child.name}: ${wasmPath}`);
            exit(1);
        }
        const wasm = await readFile(wasmPath);
        console.error(`\n[${child.name}] uploading ${wasm.length} bytes from ${child.wasm}`);

        // Reset any previously staged chunks for this name.
        const clearRes = await management.clearWasm(child.name);
        if ("err" in clearRes) {
            console.error(`clearWasm failed: ${clearRes.err}`);
            exit(1);
        }

        for (let off = 0; off < wasm.length; off += CHUNK_SIZE) {
            const chunk = wasm.subarray(off, Math.min(off + CHUNK_SIZE, wasm.length));
            const r = await management.uploadWasmChunk(
                child.name,
                Array.from(chunk),
            );
            if ("err" in r) {
                console.error(`uploadWasmChunk failed: ${r.err}`);
                exit(1);
            }
            const pct = Math.min(100, ((off + chunk.length) / wasm.length) * 100).toFixed(1);
            console.error(`  uploaded ${off + chunk.length}/${wasm.length} (${pct}%)`);
        }

        console.error(`[${child.name}] installing...`);
        const inst = await management.installCanister(
            child.name,
            Array.from(child.initArg()),
            additionalControllers,
            child.enhancedPersistence,
        );
        if ("err" in inst) {
            console.error(`installCanister failed: ${inst.err}`);
            exit(1);
        }
        const id = inst.ok.toText();
        console.error(`[${child.name}] installed at ${id}`);
        result[child.name] = id;
    }

    // Print final mapping as JSON on stdout for the workflow to consume.
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((err) => {
    console.error(err);
    exit(1);
});
