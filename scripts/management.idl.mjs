// IDL factory for the management canister, used by the CI deploy script.
// Keep this in sync with src/management/main.mo.
export const idlFactory = ({ IDL }) => {
    const Unit = IDL.Variant({ ok: IDL.Null, err: IDL.Text });
    const PrincipalResult = IDL.Variant({
        ok: IDL.Principal,
        err: IDL.Text,
    });
    const WasmInfo = IDL.Record({
        chunks: IDL.Nat,
        size: IDL.Nat,
    });

    return IDL.Service({
        getAdmin: IDL.Func([], [IDL.Opt(IDL.Principal)], ["query"]),
        getCanisterId: IDL.Func(
            [IDL.Text],
            [IDL.Opt(IDL.Principal)],
            ["query"],
        ),
        listCanisters: IDL.Func(
            [],
            [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Principal))],
            ["query"],
        ),
        wasmInfo: IDL.Func([IDL.Text], [IDL.Opt(WasmInfo)], ["query"]),
        clearWasm: IDL.Func([IDL.Text], [Unit], []),
        uploadWasmChunk: IDL.Func([IDL.Text, IDL.Vec(IDL.Nat8)], [Unit], []),
        installCanister: IDL.Func(
            [IDL.Text, IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Principal)],
            [PrincipalResult],
            [],
        ),
        cyclesBalance: IDL.Func([], [IDL.Nat], ["query"]),
    });
};
