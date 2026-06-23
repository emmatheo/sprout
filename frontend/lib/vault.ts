"use client";

import { Transaction } from "@mysten/sui/transactions";
import { DeepBookClient } from "@mysten/deepbook-v3";
import { SPROUT_PACKAGE_ID, PLATFORM_CONFIG_ID, DEEPBOOK_USDC_SUI_POOL_ID, suiClient } from "./suiClient";
import { useSponsoredTransaction } from "./sponsoredTx";

const CLOCK_ID = "0x6";

export function useVaultActions() {
  const { executeSponsored } = useSponsoredTransaction();

  const openVault = async (sender: string) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${SPROUT_PACKAGE_ID}::vault::open_vault`,
      arguments: [tx.object(CLOCK_ID)],
    });
    return await executeSponsored(tx, sender);
  };

  const deposit = async ({
    vaultId,
    amountMist,
    sourceLabel,
    payWithUsdc,
    sender
  }: {
    vaultId: string;
    amountMist: string;
    sourceLabel: string;
    payWithUsdc: boolean;
    sender: string;
  }) => {
    const tx = new Transaction();

    let coinToDeposit;

    if (payWithUsdc) {
      // DeepBook V3 Swap: USDC -> SUI
      // We assume the user has USDC and we want to swap it for SUI to deposit.
      // 1. We need to find or split the USDC coin from the user's gas/coins.
      // For this demo, we'll split it from the gas if it were USDC, but since it's a demo,
      // we'll simulate the USDC coin being passed in.

      // DEEPBOOK_PACKAGE_ID is usually 0xdee9... on testnet
      const DEEPBOOK_PACKAGE_ID = "0xdee9";

      // Find USDC coin (this is simplified for the demo)
      // In a real app, you'd use suiClient.getCoins to find the USDC coins.
      const [usdcCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(amountMist) * 2n)]); // Assume 2:1 ratio for demo or just split

      const [suiCoin] = tx.moveCall({
        target: `${DEEPBOOK_PACKAGE_ID}::deepbook::swap_exact_quote_for_base`,
        arguments: [
          tx.object(DEEPBOOK_USDC_SUI_POOL_ID),
          usdcCoin,
          tx.pure.u64(0), // account_cap: None
          tx.object(CLOCK_ID),
        ],
        typeArguments: [
          "0x...::usdc::USDC", // Quote
          "0x2::sui::SUI"      // Base
        ]
      });
      coinToDeposit = suiCoin;
    } else {
      [coinToDeposit] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
    }

    if (!coinToDeposit) {
      // Fallback for non-usdc flow if splitCoins failed or for usdc placeholder
      [coinToDeposit] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
    }

    tx.moveCall({
      target: `${SPROUT_PACKAGE_ID}::vault::deposit`,
      arguments: [
        tx.object(vaultId),
        coinToDeposit,
        tx.pure.string(sourceLabel),
        tx.object(CLOCK_ID),
      ],
    });

    return await executeSponsored(tx, sender);
  };

  const withdraw = async ({
    vaultId,
    amountMist,
    sender
  }: {
    vaultId: string;
    amountMist: string;
    sender: string;
  }) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${SPROUT_PACKAGE_ID}::vault::withdraw`,
      arguments: [
        tx.object(vaultId),
        tx.object(PLATFORM_CONFIG_ID),
        tx.pure.u64(amountMist),
      ],
    });
    return await executeSponsored(tx, sender);
  };

  const claimMilestoneBadge = async ({
    vaultId,
    milestone,
    sender
  }: {
    vaultId: string;
    milestone: number;
    sender: string;
  }) => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${SPROUT_PACKAGE_ID}::badge::claim_milestone_badge`,
      arguments: [tx.object(vaultId), tx.pure.u8(milestone)],
    });
    return await executeSponsored(tx, sender);
  };

  return { openVault, deposit, withdraw, claimMilestoneBadge };
}
