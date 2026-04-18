import type { IDL } from "@dfinity/candid";
import type { Principal } from "@dfinity/principal";

export interface User {
    principal: Principal;
    fullName: string;
    registeredAt: bigint;
}

export type RegisterResult = { ok: User } | { err: string };

export interface ListUsersArgs {
    offset: bigint;
    limit: bigint;
    search: [] | [string];
}

export interface ListUsersResult {
    users: User[];
    total: bigint;
}

export interface UsersActor {
    me: () => Promise<[] | [User]>;
    register: (fullName: string) => Promise<RegisterResult>;
    getUser: (p: Principal) => Promise<[] | [User]>;
    totalUsers: () => Promise<bigint>;
    listUsers: (args: ListUsersArgs) => Promise<ListUsersResult>;
}

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    const User = IDL.Record({
        principal: IDL.Principal,
        fullName: IDL.Text,
        registeredAt: IDL.Int,
    });
    const RegisterResult = IDL.Variant({ ok: User, err: IDL.Text });
    const ListUsersArgs = IDL.Record({
        offset: IDL.Nat,
        limit: IDL.Nat,
        search: IDL.Opt(IDL.Text),
    });
    const ListUsersResult = IDL.Record({
        users: IDL.Vec(User),
        total: IDL.Nat,
    });

    return IDL.Service({
        me: IDL.Func([], [IDL.Opt(User)], ["query"]),
        register: IDL.Func([IDL.Text], [RegisterResult], []),
        getUser: IDL.Func([IDL.Principal], [IDL.Opt(User)], ["query"]),
        totalUsers: IDL.Func([], [IDL.Nat], ["query"]),
        listUsers: IDL.Func([ListUsersArgs], [ListUsersResult], ["query"]),
    });
};
