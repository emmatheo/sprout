import { createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export const SPROUT_PACKAGE_ID =
    process.env.NEXT_PUBLIC_SPROUT_PACKAGE_ID ?? "0x9b7527f8a39d6d401e038d3beed98bbef4059b627138b6f745f4fb2b91b914ac";

export const PLATFORM_CONFIG_ID =
    process.env.NEXT_PUBLIC_PLATFORM_CONFIG_ID ?? "";

export const API_URL =
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
    testnet: {
        url: getJsonRpcFullnodeUrl("testnet"),
    },
    mainnet: {
        url: getJsonRpcFullnodeUrl("mainnet"),
    },
} as any);

export { networkConfig, useNetworkVariable, useNetworkVariables };
