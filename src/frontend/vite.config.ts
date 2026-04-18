import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Reads the canister ids produced by `dfx deploy` from the repo-root .env
// file so that the frontend can talk to the users / messages / II canisters.
export default defineConfig(({ mode }) => {
    const rootEnv = loadEnv(mode, "../../", "");

    return {
        plugins: [react()],
        build: {
            outDir: "dist",
            emptyOutDir: true,
        },
        define: {
            "import.meta.env.VITE_DFX_NETWORK": JSON.stringify(
                rootEnv.DFX_NETWORK ?? "local",
            ),
            "import.meta.env.VITE_CANISTER_ID_USERS": JSON.stringify(
                rootEnv.CANISTER_ID_USERS ?? "",
            ),
            "import.meta.env.VITE_CANISTER_ID_MESSAGES": JSON.stringify(
                rootEnv.CANISTER_ID_MESSAGES ?? "",
            ),
            "import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY":
                JSON.stringify(
                    rootEnv.CANISTER_ID_INTERNET_IDENTITY ?? "",
                ),
        },
        server: {
            proxy: {
                "/api": {
                    target: "http://127.0.0.1:4943",
                    changeOrigin: true,
                },
            },
        },
    };
});
