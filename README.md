# Sprout 🌱

Sprout is a round-up micro-investing app on the Sui blockchain. It automatically deposits spare change from purchases into an on-chain SUI savings vault.

## Project Structure

- `/contracts`: Sui Move modules for vault management and milestones.
- `/backend`: Node.js/Express server for transaction sponsorship and indexing.
- `/frontend`: Next.js application with Enoki (zkLogin) and DeepBook integration.
- `/scripts`: Deployment and demo seeding scripts.

## Quickstart

### 1. Contracts
```bash
cd contracts
sui move build
# Deploy using the script
../scripts/deploy.sh testnet
```

### 2. Backend
```bash
cd backend
npm install
# Copy .env.example and fill in the IDs from deployment
cp .env.example .env
# Start the server
npm run dev
# In a separate terminal, start the indexer
npm run indexer
```

### 3. Frontend
```bash
cd frontend
npm install
# Copy .env.local.example and fill in the IDs
cp .env.local.example .env.local
# Start the app
npm run dev
```

## Key Technologies

- **Sui Blockchain**: Core on-chain logic.
- **Enoki (zkLogin)**: Seamless onboarding with Google.
- **DeepBook v3**: Atomic swaps from USDC to SUI.
- **Walrus**: Statement storage (future integration).
- **PostgreSQL**: Event indexing and pending round-up tracking.

## User Flow

1. **Connect**: Sign in with Google (via Enoki) or a Sui wallet.
2. **Setup**: Open a free SUI vault (sponsored by Sprout).
3. **Spend**: Simulate purchases using `scripts/seed_demo.sh`.
4. **Invest**: Deposit pending round-ups into your vault from the dashboard.
5. **Grow**: Watch your plant grow as your balance increases!
