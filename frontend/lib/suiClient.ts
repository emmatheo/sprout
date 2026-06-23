import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { createNetworkConfig } from "@mysten/dapp-kit";

export const SPROUT_PACKAGE_ID = process.env.NEXT_PUBLIC_SPROUT_PACKAGE_ID!;
export const PLATFORM_CONFIG_ID = process.env.NEXT_PUBLIC_PLATFORM_CONFIG_ID!;
export const DEEPBOOK_USDC_SUI_POOL_ID = process.env.NEXT_PUBLIC_DEEPBOOK_POOL_ID!;
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const { networkConfig, useNetworkVariable, useNetworkVariables } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
  },
  mainnet: {
    url: getFullnodeUrl("mainnet"),
  },
});

const suiClient = new SuiClient({ url: networkConfig.testnet.url });

export { networkConfig, useNetworkVariable, useNetworkVariables, suiClient };
