# Sprout — Architecture

## What it is in one sentence
Sprout automatically rounds up every purchase to the next whole unit and
invests the spare change into a personal onchain SUI vault — no lump sum,
no crypto knowledge, no wallet install required to start.

## Why Sui specifically

| Product requirement | Sui primitive used | Why it can't be faked elsewhere |
|---|---|---|
| New users onboard without installing anything | zkLogin via Enoki | Google OAuth → ZK proof → real Sui address. No seed phrase, no extension |
| Existing Sui wallet users connect normally | wallet-standard, same dapp-kit `WalletProvider` | Both paths registered in one modal; identical signing code from both |
| Users never pay gas themselves | Sponsored transactions via Enoki | Gas station covers vault open + first N deposits; backend allowlists only Sprout's own Move calls |
| Thousands of users depositing simultaneously never contend | Owned `Vault` objects, not a shared pool | Owned objects skip consensus ordering entirely — 1M concurrent deposits have no shared-state bottleneck |
| Full deposit history lives on the object itself | Dynamic fields keyed by `deposit_count` | Each log entry is a dynamic field on the user's own `Vault` — no separate contract, no off-chain trust |
| Deposit with any coin the user holds | DeepBook composed inside PTB | Swap + deposit = one atomic transaction. If the swap fails, the deposit never happens |
| Savings record is portable, unfakeable, non-transferable | `MilestoneBadge` soulbound (no `store`) | Move's type system: no `store` means the contract is literally the only code that can ever move this object |
| Statement / export doesn't depend on Sprout's server | Walrus blob storage | Statement JSON uploaded to Walrus; user gets a direct aggregator URL — Sprout's backend can go down, the statement is still there |
| User's linked spending-source identifier stays private | Seal + Walrus | Encrypted on Walrus, policy enforced by `spending_source::seal_approve_source` — only the vault owner can decrypt |

## System diagram (described)

```
User's browser
  │
  ├─ New user: Google OAuth → Enoki/zkLogin → Sui address (no install)
  ├─ Existing user: Sui Wallet / Suiet / etc → wallet-standard connect
  │
  ▼
Next.js frontend
  │  useSponsoredTransaction hook
  │  → POST /api/sponsor (backend signs gas via Enoki secret key)
  │  → User signs intent (wallet-standard signTransaction)
  │  → POST /api/sponsor/execute
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

Walrus:  savings statement JSON blobs (user-downloadable permanent export)
Seal:    encrypted spending-source identifier (only vault owner can decrypt)
```

## Sponsorship policy
The backend's `/api/sponsor` endpoint allowlists four Move call targets:
`vault::open_vault`, `vault::deposit`, `vault::withdraw`,
`badge::claim_milestone_badge`. Any other target is rejected with a 403
before Enoki is ever called, so the gas station can't be abused.

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
