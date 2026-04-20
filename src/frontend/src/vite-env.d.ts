/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_DFX_NETWORK: string;
    readonly VITE_CANISTER_ID_USERS: string;
    readonly VITE_CANISTER_ID_MESSAGES: string;
    readonly VITE_CANISTER_ID_MANAGEMENT: string;
    readonly VITE_CANISTER_ID_INTERNET_IDENTITY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
