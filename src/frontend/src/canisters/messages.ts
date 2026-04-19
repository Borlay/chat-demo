import type { IDL } from "@dfinity/candid";
import type { Principal } from "@dfinity/principal";

export interface Message {
    id: bigint;
    sender: Principal;
    content: string;
    timestamp: bigint;
}

export interface PageArgs {
    offset: bigint;
    limit: bigint;
}

export interface MessagePage {
    messages: Message[];
    total: bigint;
}

export type PostResult = { ok: Message } | { err: string };

export interface ConversationSummary {
    peer: Principal;
    lastMessageId: bigint;
}

export interface MessagesActor {
    postGeneral: (content: string) => Promise<PostResult>;
    getGeneral: (args: PageArgs) => Promise<MessagePage>;
    postPrivate: (peer: Principal, content: string) => Promise<PostResult>;
    getPrivate: (peer: Principal, args: PageArgs) => Promise<MessagePage>;
    listMyConversations: () => Promise<ConversationSummary[]>;
    getGeneralLatestId: () => Promise<[] | [bigint]>;
}

export const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
    const Message = IDL.Record({
        id: IDL.Nat,
        sender: IDL.Principal,
        content: IDL.Text,
        timestamp: IDL.Int,
    });
    const PageArgs = IDL.Record({
        offset: IDL.Nat,
        limit: IDL.Nat,
    });
    const MessagePage = IDL.Record({
        messages: IDL.Vec(Message),
        total: IDL.Nat,
    });
    const PostResult = IDL.Variant({ ok: Message, err: IDL.Text });

    const ConversationSummary = IDL.Record({
        peer: IDL.Principal,
        lastMessageId: IDL.Nat,
    });

    return IDL.Service({
        postGeneral: IDL.Func([IDL.Text], [PostResult], []),
        getGeneral: IDL.Func([PageArgs], [MessagePage], ["query"]),
        postPrivate: IDL.Func([IDL.Principal, IDL.Text], [PostResult], []),
        getPrivate: IDL.Func(
            [IDL.Principal, PageArgs],
            [MessagePage],
            ["query"],
        ),
        listMyConversations: IDL.Func(
            [],
            [IDL.Vec(ConversationSummary)],
            ["query"],
        ),
        getGeneralLatestId: IDL.Func([], [IDL.Opt(IDL.Nat)], ["query"]),
    });
};
