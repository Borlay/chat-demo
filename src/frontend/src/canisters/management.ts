import type { IDL } from "@dfinity/candid";
import type { Principal } from "@dfinity/principal";

export type RunStatus =
    | { running: null }
    | { stopping: null }
    | { stopped: null };

export interface CanisterStatusInfo {
    name: string;
    canisterId: Principal;
    cycles: bigint;
    memorySize: bigint;
    idleCyclesBurnedPerDay: bigint;
    moduleHash: [] | [Uint8Array | number[]];
    status: [] | [RunStatus];
    error: [] | [string];
}

export interface ManagementActor {
    getCanistersStatus: () => Promise<CanisterStatusInfo[]>;
}

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    const RunStatus = IDL.Variant({
        running: IDL.Null,
        stopping: IDL.Null,
        stopped: IDL.Null,
    });
    const CanisterStatusInfo = IDL.Record({
        name: IDL.Text,
        canisterId: IDL.Principal,
        cycles: IDL.Nat,
        memorySize: IDL.Nat,
        idleCyclesBurnedPerDay: IDL.Nat,
        moduleHash: IDL.Opt(IDL.Vec(IDL.Nat8)),
        status: IDL.Opt(RunStatus),
        error: IDL.Opt(IDL.Text),
    });

    return IDL.Service({
        getCanistersStatus: IDL.Func([], [IDL.Vec(CanisterStatusInfo)], []),
    });
};
