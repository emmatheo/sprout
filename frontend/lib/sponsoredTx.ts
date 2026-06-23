"use client";

import { useSignTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { suiClient, API_URL } from "./suiClient";

export function useSponsoredTransaction() {
  const { mutateAsync: signTransaction } = useSignTransaction();

  const executeSponsored = async (tx: Transaction, sender: string) => {
    try {
      // 1. Build transaction kind bytes
      const transactionKindBytes = await tx.build({
        client: suiClient,
        onlyTransactionKind: true,
      });

      // 2. Request sponsorship from backend
      const sponsorResponse = await fetch(`${API_URL}/api/sponsor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionKindBytes: Buffer.from(transactionKindBytes).toString("base64"),
          sender,
        }),
      });

      if (!sponsorResponse.ok) {
        throw new Error("Failed to get sponsorship");
      }

      const { bytes, digest: sponsorDigest } = await sponsorResponse.json();

      // 3. Reconstruct transaction and sign
      const sponsoredTx = Transaction.from(bytes);
      const { signature } = await signTransaction({
        transaction: sponsoredTx as any,
      });

      // 4. Send for execution
      const executeResponse = await fetch(`${API_URL}/api/sponsor/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          digest: sponsorDigest,
          signature,
        }),
      });

      if (!executeResponse.ok) {
        throw new Error("Failed to execute sponsored transaction");
      }

      return await executeResponse.json();
    } catch (error) {
      console.error("Sponsored transaction error:", error);
      throw error;
    }
  };

  return { executeSponsored };
}
