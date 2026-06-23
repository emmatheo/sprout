"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { EnokiClient } from "@mysten/enoki";
import { useEffect, useState } from "react";
import { networkConfig, suiClient } from "../lib/suiClient";

import { EnokiFlowProvider } from "@mysten/enoki/react";

// Import dapp-kit styles
import "@mysten/dapp-kit/dist/index.css";

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <EnokiFlowProvider apiKey={process.env.NEXT_PUBLIC_ENOKI_PUBLIC_API_KEY ?? ""}>
        <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
          <WalletProvider autoConnect>
            {children}
          </WalletProvider>
        </SuiClientProvider>
      </EnokiFlowProvider>
    </QueryClientProvider>
  );
}
