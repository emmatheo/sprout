import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useMemo } from "react";

import {
    SPROUT_PACKAGE_ID,
    PLATFORM_CONFIG_ID,
} from "./suiClient";

const CLOCK_ID = "0x6";

export function useVaultActions() {
    const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
    const suiClient = useSuiClient();

    return useMemo(() => {
        return {
            openVault: async () => {
                console.log("[useVaultActions] Building openVault transaction...");
                if (!SPROUT_PACKAGE_ID) throw new Error("PRODUCTION ERROR: SPROUT_PACKAGE_ID is missing from environment.");

                const tx = new Transaction();
                // High gas budget for safety on testnet
                tx.setGasBudget(50_000_000);

                tx.moveCall({
                    target: `${SPROUT_PACKAGE_ID}::vault::open_vault`,
                    arguments: [tx.object(CLOCK_ID)],
                });

                console.log("[useVaultActions] Requesting signature via dApp-kit...");
                try {
                    const result = await signAndExecuteTransaction({
                        transaction: tx,
                        chain: 'sui:testnet', // Explicitly specify chain to avoid ambiguity
                    });
                    console.log("[useVaultActions] Sign successful. Transaction Digest:", result.digest);

                    console.log("[useVaultActions] Waiting for transaction effects...");
                    await suiClient.waitForTransaction({ digest: result.digest });

                    return result;
                } catch (error: any) {
                    console.error("[useVaultActions] FULL EXCEPTION during signAndExecuteTransaction:", error);
                    if (error.stack) console.error("[useVaultActions] STACK TRACE:", error.stack);
                    if (error.data) console.error("[useVaultActions] ERROR DATA:", JSON.stringify(error.data, null, 2));
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
                        chain: 'sui:testnet',
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
                        chain: 'sui:testnet',
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
