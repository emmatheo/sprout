# Sprout — Architecture

## What it is in one sentence
Sprout automatically rounds up every purchase to the next whole unit and
invests the spare change into a personal onchain SUI vault.

## Why Sui specifically

| Product requirement | Sui primitive used | Why it can't be faked elsewhere |
|---|---|---|
| Existing Sui wallet users connect normally | wallet-standard, same dapp-kit `WalletProvider` | Both paths registered in one modal; identical signing code from both |
| Thousands of users depositing simultaneously never contend | Owned `Vault` objects, not a shared pool | Owned objects skip consensus ordering entirely — 1M concurrent deposits have no shared-state bottleneck |
| Full deposit history lives on the object itself | Dynamic fields keyed by `deposit_count` | Each log entry is a dynamic field on the user's own `Vault` — no separate contract, no off-chain trust |
| Savings record is portable, unfakeable, non-transferable | `MilestoneBadge` soulbound (no `store`) | Move's type system: no `store` means the contract is literally the only code that can ever move this object |

## System diagram (described)

```
User's browser
  │
  ├─ Sui Wallet / Suiet / etc → wallet-standard connect
  │
  ▼
Next.js frontend
  │  User signs transactions with the connected wallet
  │
  │  PTB examples:
  │   open_vault: vault::open_vault(clock)
  │   deposit:    [deepbook swap?] → vault::deposit(vault, coin, label, clock)
  │   withdraw:   vault::withdraw(vault, platform_config, amount)
  │   badge:      badge::claim_milestone_badge(vault, milestone)
  │
  ▼
Sui testnet / mainnet
  ├─ sprout::platform    (shared PlatformConfig, fee = 0.5% on withdrawal)
  ├─ sprout::vault       (owned Vault per user, dynamic-field deposit log)
  ├─ sprout::badge       (soulbound MilestoneBadge, milestone-claimed marker on Vault)
  └─ sprout::spending_source  (Seal access policy for encrypted source identifier)

Chain events → Event indexer (polling loop, separate process)
                    │
                    └─→ Postgres DB
                             ├─ vaults           (balance mirror for fast reads)
                             ├─ deposits         (history tab)
                             ├─ pending_roundups (purchase feed accumulator)
                             └─ withdrawals

```

Revenue model: 0.5% fee on withdrawal, collected by the protocol treasury,
enforced by the contract itself — not by the backend.

## What's deliberately out of MVP scope
- **Yield on idle vault balance** — SUI sitting in a Vault earns nothing yet.
  Phase 2 is routing idle balances to a Sui-native liquid staking position
  (e.g. via Aftermath or a native staking pool) while keeping the vault's
  withdrawal guarantee intact.
- **Real spending webhook** — the MVP uses a simulate endpoint.
  Production plugs in Plaid (webhook on transaction settlement) or a card-
  issuer partner API.
- **Social / referral loop** — "invite a friend, share your sprout growth"
  virality is designed around the SproutGrowth visual but not wired up yet.
