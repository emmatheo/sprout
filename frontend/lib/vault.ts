import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useMemo } from "react";

import {
  SPROUT_PACKAGE_ID,
  PLATFORM_CONFIG_ID,
  SUI_CHAIN,
} from "./suiClient";

const CLOCK_ID = "0x6";

function extractCreatedVaultId(response: { objectChanges?: Array<{ type: string; objectId?: string; objectType?: string }> }) {
  return response.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.endsWith("::vault::Vault"),
  )?.objectId;
}

export function useVaultActions() {
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  return useMemo(() => {
    return {
      openVault: async () => {
        console.log("[useVaultActions] PHASE: openVault Started");
        if (!SPROUT_PACKAGE_ID) {
          console.error("[useVaultActions] FAILED: SPROUT_PACKAGE_ID is missing from environment.");
          throw new Error("PRODUCTION ERROR: SPROUT_PACKAGE_ID is missing from environment.");
        }

        console.log("[useVaultActions] STEP: Building Transaction Block...");
        const tx = new Transaction();
        tx.setGasBudget(50_000_000);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::open_vault`,
          arguments: [tx.object(CLOCK_ID)],
        });
        console.log("[useVaultActions] COMPLETED: Transaction Block Built.");

        console.log("[useVaultActions] STEP: Requesting Wallet Signature...");
        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });
          console.log("[useVaultActions] COMPLETED: Signature Received. Digest:", result.digest);

          console.log("[useVaultActions] STEP: Waiting for On-Chain Confirmation (Effects)...");
          const effects = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showEffects: true, showObjectChanges: true, showEvents: true }
          });
          console.log("[useVaultActions] COMPLETED: Transaction Confirmed on Blockchain.");
          console.log("[useVaultActions] DATA: Status:", effects.effects?.status.status);

          return {
            ...result,
            createdVaultId: extractCreatedVaultId(effects),
          };
        } catch (error: any) {
          console.error("[useVaultActions] FAILED: Execution Error:", error.message || error);
          if (error.stack) console.error("[useVaultActions] TRACE:", error.stack);
          throw error;
        }
      },

      deposit: async (vaultId: string, amountMist: string, sourceLabel: string = "Deposit") => {
        console.log(`[useVaultActions] Building deposit: ${amountMist} mist for vault ${vaultId}`);
        if (!SPROUT_PACKAGE_ID) throw new Error("PRODUCTION ERROR: SPROUT_PACKAGE_ID is missing.");

        const tx = new Transaction();
        tx.setGasBudget(30_000_000);

        const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::deposit`,
          arguments: [tx.object(vaultId), coin, tx.pure.string(sourceLabel), tx.object(CLOCK_ID)],
        });

        console.log("[useVaultActions] Requesting signature for deposit...");
        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });
          await suiClient.waitForTransaction({ digest: result.digest });
          return result;
        } catch (error: any) {
          console.error("[useVaultActions] Deposit failure details:", error);
          throw error;
        }
      },

      withdraw: async (vaultId: string, amountMist: string) => {
        console.log(`[useVaultActions] Building withdraw: ${amountMist} mist from vault ${vaultId}`);
        if (!SPROUT_PACKAGE_ID || !PLATFORM_CONFIG_ID) throw new Error("PRODUCTION ERROR: Missing config IDs.");

        const tx = new Transaction();
        tx.setGasBudget(30_000_000);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::withdraw`,
          arguments: [tx.object(vaultId), tx.object(PLATFORM_CONFIG_ID), tx.pure.u64(amountMist)],
        });

        console.log("[useVaultActions] Requesting signature for withdrawal...");
        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });
          await suiClient.waitForTransaction({ digest: result.digest });
          return result;
        } catch (error: any) {
          console.error("[useVaultActions] Withdrawal failure details:", error);
          throw error;
        }
      },
    };
  }, [signAndExecuteTransaction, suiClient]);
}
