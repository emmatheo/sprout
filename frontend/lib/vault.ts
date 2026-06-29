import { useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { useMemo } from "react";

import {
  SPROUT_PACKAGE_ID,
  PLATFORM_CONFIG_ID,
  SUI_CHAIN,
} from "./suiClient";

const CLOCK_ID = "0x6";
const DEPOSIT_GAS_BUDGET_MIST = 30_000_000n;
const SUI_COIN_TYPE = "0x2::sui::SUI";

type SuiCoin = {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
};

function extractCreatedVaultId(response: { objectChanges?: Array<{ type: string; objectId?: string; objectType?: string }> | null }) {
  return response.objectChanges?.find(
    (change) => change.type === "created" && change.objectType?.endsWith("::vault::Vault"),
  )?.objectId;
}

export function useVaultActions() {
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  return useMemo(() => {
    const getSuiCoins = async (owner: string) => {
      const coins: SuiCoin[] = [];
      let cursor: string | null | undefined = null;

      do {
        const page = await suiClient.getCoins({
          owner,
          coinType: SUI_COIN_TYPE,
          cursor,
        });
        coins.push(...page.data);
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);

      return coins;
    };

    const buildDepositCoin = async (tx: Transaction, owner: string, amountMist: bigint) => {
      const coins = await getSuiCoins(owner);
      const totalBalance = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);

      if (totalBalance < amountMist + DEPOSIT_GAS_BUDGET_MIST) {
        throw new Error("Insufficient wallet balance.");
      }

      tx.setGasPayment(coins.map((coin) => ({
        objectId: coin.coinObjectId,
        version: coin.version,
        digest: coin.digest,
      })));

      const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist.toString())]);
      return depositCoin;
    };

    return {
      openVault: async () => {
        if (!SPROUT_PACKAGE_ID) {
          throw new Error("PRODUCTION ERROR: SPROUT_PACKAGE_ID is missing from environment.");
        }

        const tx = new Transaction();
        tx.setGasBudget(50_000_000);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::open_vault`,
          arguments: [tx.object(CLOCK_ID)],
        });

        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });

          const effects = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showEffects: true, showObjectChanges: true, showEvents: true }
          });

          if (effects.effects?.status.status !== "success") {
            throw new Error(effects.effects?.status.error || "Vault transaction failed on-chain.");
          }

          return {
            ...result,
            effects,
            createdVaultId: extractCreatedVaultId(effects),
          };
        } catch (error: any) {
          throw error;
        }
      },

      deposit: async (owner: string, vaultId: string, amountMist: string, sourceLabel: string = "Deposit") => {
        if (!SPROUT_PACKAGE_ID) throw new Error("PRODUCTION ERROR: SPROUT_PACKAGE_ID is missing.");

        const parsedAmount = BigInt(amountMist);
        if (parsedAmount <= 0n) {
          throw new Error("Deposit amount must be greater than zero.");
        }

        const tx = new Transaction();
        tx.setSender(owner);
        tx.setGasBudget(DEPOSIT_GAS_BUDGET_MIST.toString());

        const coin = await buildDepositCoin(tx, owner, parsedAmount);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::deposit`,
          arguments: [tx.object(vaultId), coin, tx.pure.string(sourceLabel), tx.object(CLOCK_ID)],
        });

        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });
          const effects = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showEffects: true },
          });
          if (effects.effects?.status.status !== "success") {
            throw new Error(effects.effects?.status.error || "Deposit transaction failed on-chain.");
          }
          return result;
        } catch (error: any) {
          throw error;
        }
      },

      withdraw: async (vaultId: string, amountMist: string) => {
        if (!SPROUT_PACKAGE_ID || !PLATFORM_CONFIG_ID) throw new Error("PRODUCTION ERROR: Missing config IDs.");

        const tx = new Transaction();
        tx.setGasBudget(30_000_000);

        tx.moveCall({
          target: `${SPROUT_PACKAGE_ID}::vault::withdraw`,
          arguments: [tx.object(vaultId), tx.object(PLATFORM_CONFIG_ID), tx.pure.u64(amountMist)],
        });

        try {
          const result = await signAndExecuteTransaction({
            transaction: tx,
            chain: SUI_CHAIN,
          });
          const effects = await suiClient.waitForTransaction({
            digest: result.digest,
            options: { showEffects: true },
          });
          if (effects.effects?.status.status !== "success") {
            throw new Error(effects.effects?.status.error || "Withdrawal transaction failed on-chain.");
          }
          return result;
        } catch (error: any) {
          throw error;
        }
      },
    };
  }, [signAndExecuteTransaction, suiClient]);
}
