import { Router } from 'express';
import { EnokiClient } from '@mysten/enoki';
import { Transaction } from '@mysten/sui/transactions';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const enokiApiKey = process.env.ENOKI_SECRET_API_KEY;
if (!enokiApiKey) {
  console.warn('WARNING: ENOKI_SECRET_API_KEY is not set. Sponsorship will not work.');
}

const enoki = new EnokiClient({
  apiKey: enokiApiKey || 'placeholder-for-no-key-mode',
});

const PACKAGE_ID = process.env.SPROUT_PACKAGE_ID!;
const NETWORK = (process.env.SUI_NETWORK as 'mainnet' | 'testnet') || 'testnet';

// POST /api/sponsor: Sponsor a transaction
router.post('/', async (req, res) => {
  const { transactionKindBytes, sender } = req.body;

  if (!transactionKindBytes || !sender) {
    return res.status(400).json({ error: 'Missing transactionKindBytes or sender' });
  }

  try {
    // 1. Decode and inspect transaction
    const tx = Transaction.fromKind(transactionKindBytes);

    // 2. Allowlist checks
    const allowedTargets = [
      `${PACKAGE_ID}::vault::open_vault`,
      `${PACKAGE_ID}::vault::deposit`,
      `${PACKAGE_ID}::vault::withdraw`,
      `${PACKAGE_ID}::badge::claim_milestone_badge`,
    ];

    // Basic safety check: ensure all MoveCalls are in the allowlist
    const commands = tx.getData().commands;
    for (const command of commands) {
      if (command.$kind === 'MoveCall') {
        const call = command.MoveCall;
        const target = `${call.package}::${call.module}::${call.function}`;
        if (!allowedTargets.includes(target)) {
          return res.status(403).json({ error: `Unauthorized MoveCall target: ${target}` });
        }
      }
    }

    // 3. Create sponsored transaction via Enoki
    const sponsored = await enoki.createSponsoredTransaction({
      network: NETWORK,
      transactionKindBytes,
      sender,
    });

    res.json(sponsored);
  } catch (error) {
    console.error('Sponsorship error:', error);
    res.status(500).json({ error: 'Failed to sponsor transaction' });
  }
});

// POST /api/sponsor/execute: Execute a sponsored transaction
router.post('/execute', async (req, res) => {
  const { digest, signature } = req.body;

  if (!digest || !signature) {
    return res.status(400).json({ error: 'Missing digest or signature' });
  }

  try {
    const result = await enoki.executeSponsoredTransaction({
      digest,
      signature,
    });
    res.json(result);
  } catch (error) {
    console.error('Execution error:', error);
    res.status(500).json({ error: 'Failed to execute sponsored transaction' });
  }
});

export default router;
