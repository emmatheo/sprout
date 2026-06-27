import { Router } from 'express';
import { pool } from '../db/pool.js';
import { client, PACKAGE_ID } from '../sui.js';

const router = Router();

function asMistString(value: unknown): string {
  if (value == null) return '0';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object' && 'fields' in value) {
    const fields = (value as { fields?: { value?: unknown } }).fields;
    return asMistString(fields?.value);
  }
  return '0';
}

// GET /api/vaults/:address - Get vault summary
router.get('/:address', async (req, res) => {
  const { address } = req.params;
  try {
    console.log(`[Vaults] STEP: Querying Database for owner ${address}`);
    let result = await pool.query('SELECT * FROM vaults WHERE owner = $1', [address]);

    if (result.rows.length === 0) {
      console.log(`[Vaults] INFO: Not found in DB, falling back to On-Chain objects check...`);

      if (!PACKAGE_ID) {
        console.error('[Vaults] FAILED: SPROUT_PACKAGE_ID is not configured.');
        return res.status(500).json({ error: 'Sui package is not configured' });
      }

      // Resilient on-chain check with multiple attempts to handle indexer lag
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          console.log(`[Vaults] STEP: On-chain check attempt ${attempt + 1}...`);
          const objects = await client.getOwnedObjects({
            owner: address,
            filter: { StructType: `${PACKAGE_ID}::vault::Vault` },
            options: { showContent: true }
          });

          if (objects.data.length > 0) {
            const vaultObj = objects.data[0];
            const vaultId = vaultObj.data?.objectId;
            const content = vaultObj.data?.content as any;

            if (vaultId && content?.fields) {
              console.log(`[Vaults] SUCCESS: Found vault ${vaultId} on-chain. Syncing to DB...`);
              const fields = content.fields;
              const balance = asMistString(fields.balance);
              const totalDeposited = asMistString(fields.total_deposited);
              const depositCount = Number(asMistString(fields.deposit_count));
              const insertResult = await pool.query(
                'INSERT INTO vaults (owner, vault_id, balance, total_deposited, deposit_count, opened_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (owner) DO UPDATE SET vault_id = EXCLUDED.vault_id, balance = EXCLUDED.balance, total_deposited = EXCLUDED.total_deposited, deposit_count = EXCLUDED.deposit_count RETURNING *',
                [
                  address,
                  vaultId,
                  balance,
                  totalDeposited,
                  Number.isFinite(depositCount) ? depositCount : 0,
                  fields.opened_at_ms ? new Date(Number(fields.opened_at_ms)) : new Date()
                ]
              );
              result = insertResult;
              console.log(`[Vaults] COMPLETED: DB Synchronized.`);
              break; // Exit retry loop on success
            }
          }

          if (attempt < 2) {
            console.log(`[Vaults] INFO: No vault found on-chain yet, waiting 2s before retry...`);
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (chainErr) {
          console.error(`[Vaults] FAILED: On-chain check error during attempt ${attempt + 1}:`, chainErr);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (result.rows.length === 0) {
      console.log(`[Vaults] [INFO] Vault not found for ${address}.`);
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Convert BigInt to string
    const vault = result.rows[0];
    console.log(`[Vaults] [SUCCESS] Returning vault ${vault.vault_id} for ${address}`);
    vault.total_deposited = vault.total_deposited.toString();
    vault.balance = vault.balance.toString();

    res.json(vault);
  } catch (error) {
    console.error('[Vaults] [CRITICAL] Error fetching vault:', error);
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

    const deposits = result.rows.map((row: any) => ({
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
