import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// GET /api/vaults/:address - Get vault summary
router.get('/:address', async (req, res) => {
  const { address } = req.params;
  try {
    const result = await pool.query('SELECT * FROM vaults WHERE owner = $1', [address]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Convert BigInt to string
    const vault = result.rows[0];
    vault.total_deposited = vault.total_deposited.toString();
    vault.balance = vault.balance.toString();

    res.json(vault);
  } catch (error) {
    console.error('Error fetching vault:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vaults/:address/deposits - Get deposit history
router.get('/:address/deposits', async (req, res) => {
  const { address } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM deposits WHERE owner = $1 ORDER BY deposited_at DESC LIMIT 50',
      [address]
    );

    const deposits = result.rows.map(row => ({
      ...row,
      amount_mist: row.amount_mist.toString(),
    }));

    res.json(deposits);
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
