import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// POST /api/roundups/simulate - Simulate a purchase and record a pending roundup
router.post('/simulate', async (req, res) => {
  const { address, purchaseAmount } = req.body;

  if (!address || purchaseAmount === undefined) {
    return res.status(400).json({ error: 'Missing address or purchaseAmount' });
  }

  const amount = parseFloat(purchaseAmount);
  if (isNaN(amount)) {
    return res.status(400).json({ error: 'Invalid purchaseAmount' });
  }

  const roundup = Math.ceil(amount) - amount;
  const roundupMist = Math.round(roundup * 1_000_000_000);

  if (roundupMist === 0) {
    return res.status(200).json({ message: 'Exact amount - no roundup needed' });
  }

  try {
    await pool.query(
      'INSERT INTO pending_roundups (owner, amount_mist, source_label) VALUES ($1, $2, $3)',
      [address, roundupMist, `Purchase: $${amount.toFixed(2)}`]
    );
    res.json({ success: true, roundupMist: roundupMist.toString() });
  } catch (error) {
    console.error('Error simulating roundup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/roundups/:address/pending - Get pending roundups
router.get('/:address/pending', async (req, res) => {
  const { address } = req.params;
  try {
    const result = await pool.query(
      'SELECT SUM(amount_mist) as pending_mist, COUNT(*) as count FROM pending_roundups WHERE owner = $1 AND deposited = FALSE',
      [address]
    );

    const pendingMist = result.rows[0].pending_mist || '0';
    const count = parseInt(result.rows[0].count);

    res.json({
      pendingMist: pendingMist.toString(),
      sinceLastDeposit: count
    });
  } catch (error) {
    console.error('Error fetching pending roundups:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/roundups/seed-demo - Seed random roundups for the demo
router.post('/seed-demo', async (req, res) => {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ error: 'Missing address' });
  }

  try {
    const numSeeds = 5 + Math.floor(Math.random() * 6); // 5-10 seeds
    const insertPromises = [];

    for (let i = 0; i < numSeeds; i++) {
      const amount = 10 + Math.random() * 90; // $10 - $100
      const roundup = Math.ceil(amount) - amount;
      const roundupMist = Math.round(roundup * 1_000_000_000);

      if (roundupMist > 0) {
        insertPromises.push(
          pool.query(
            'INSERT INTO pending_roundups (owner, amount_mist, source_label) VALUES ($1, $2, $3)',
            [address, roundupMist, `Coffee/Lunch: $${amount.toFixed(2)}`]
          )
        );
      }
    }

    await Promise.all(insertPromises);
    res.json({ success: true, seeded: numSeeds });
  } catch (error) {
    console.error('Error seeding demo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
