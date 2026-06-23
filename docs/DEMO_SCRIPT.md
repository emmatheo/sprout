# Sprout — Demo Script (5 minutes)

## Setup before you walk up
1. `bash scripts/seed_demo.sh <your_demo_address>` — queues 10 simulated
   purchases in the DB so the dashboard shows a real pending round-up total.
2. Have a fresh browser profile open (no Sui extension installed at all).
3. Have a second browser tab open with the same address in Sui Wallet, as the
   "crypto user" persona.
4. Have the Sui explorer open on a third tab, ready to show transaction output.

---

## 0:00 – 0:35 — The problem (one slide or verbal)
"Every time you buy a coffee for $4.30, $0.70 is wasted potential — you
rounded up to $5 in your head anyway. Acorns built a $4B company on this
exact insight for stocks. Nobody has done it for crypto. Sprout does."

---

## 0:35 – 1:30 — Onboarding path 1: brand-new user, no wallet
Open the fresh browser profile. Go to Sprout. Click **Get started**. The
dapp-kit modal opens — show that it lists **"Continue with Google"** right
alongside Phantom or Sui Wallet if they were installed.

Click Continue with Google. Real OAuth screen. Click through. Redirect
back. Narrate: *"That's zkLogin — a real Sui address was just derived from
this Google login, entirely in a ZK proof. No seed phrase was generated,
no browser extension was installed."*

Show the wallet address now visible in the nav — copy it.

---

## 1:30 – 2:10 — Open a vault, gas is free
Click **Open my vault**. One signature prompt — click Approve. Narrate
while it confirms: *"Sprout's backend just asked Enoki to pay the gas for
this transaction. The user paid nothing — they don't even hold SUI yet."*

Vault opens, sprout graphic appears at minimum height.

---

## 2:10 – 3:10 — Deposit pending round-ups, pay with USDC
Dashboard shows 10 pending round-ups, e.g. **0.847 SUI** total. Tick
**"Fund from USDC"** checkbox. Click **Deposit now**.

Narrate while it confirms: *"This just did two things in one transaction:
swapped USDC for exactly 0.847 SUI on DeepBook — an onchain order book,
not a wrapped DEX — and deposited it into the vault. If the swap had failed,
the deposit wouldn't happen either. Atomic. One signature."*

Watch the sprout grow taller on screen. Show the vault balance update.

---

## 3:10 – 3:45 — Milestone badge, live
The first-deposit milestone is now claimable. Click **Claim badge**.
One sponsored transaction. Switch to the Sui explorer tab and show the
resulting object: type `sprout::badge::MilestoneBadge`, no transfer
function, soulbound.

*"This badge lives at this address forever. Nobody — not Sprout, not the
user — can move it, sell it, or fake it. It's just proof: this person
started saving."*

---

## 3:45 – 4:20 — Onboarding path 2: existing Sui wallet (30 seconds)
Switch to the second browser profile (Sui Wallet installed). Open Sprout,
click **Get started** — exact same modal, Sui Wallet appears. Connect.
Dashboard loads. Open vault. *"Same app, same contracts, two completely
different onboarding paths, zero code changes between them."*

---

## 4:20 – 4:50 — Why this is a Sui story
Quick verbal summary:
- Vault = owned object → parallel deposits at scale, no shared-state
  bottleneck
- Deposit history = dynamic fields directly on the object → no separate
  indexer to prove your track record
- Swap + deposit = one PTB → atomic, no partial-execution risk
- Badge = no `store` ability → literally cannot be transferred by anyone

*"Every Sui primitive here is load-bearing. This is not a generic DeFi
app that happens to be on Sui."*

---

## 4:50 – 5:00 — What comes next (one sentence each)
- Yield: route idle vault balances to a Sui liquid-staking pool.
- Credit: a third-party lender can read milestone badges to underwrite
  an undercollateralized loan — without us building the lending product.
- Real spending feed: production Plaid webhook replaces the simulate
  endpoint.

---

## If something breaks live
Use the pre-recorded 90-second screen capture (record the full flow the
night before). Narrate over it. Do not apologise — explain what you're
showing.
