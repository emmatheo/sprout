import { createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

export const SPROUT_PACKAGE_ID =
  process.env.NEXT_PUBLIC_SPROUT_PACKAGE_ID ?? "";

export const PLATFORM_CONFIG_ID =
  process.env.NEXT_PUBLIC_PLATFORM_CONFIG_ID ?? "";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const SUI_NETWORK =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as "testnet" | "mainnet") ?? "testnet";

export const SUI_CHAIN = `sui:${SUI_NETWORK}` as const;

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getJsonRpcFullnodeUrl("testnet"),
  },
  mainnet: {
    url: getJsonRpcFullnodeUrl("mainnet"),
  },
} as any);

export { networkConfig, useNetworkVariable, useNetworkVariables };
