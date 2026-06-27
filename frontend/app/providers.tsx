"use client";

import "@mysten/dapp-kit/dist/index.css";

import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";

import {
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";

import { networkConfig, SUI_NETWORK } from "../lib/suiClient";

const queryClient = new QueryClient();

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={SUI_NETWORK}
      >
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
