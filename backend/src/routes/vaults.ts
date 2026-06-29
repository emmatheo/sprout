import { Router } from 'express';
import { pool } from '../db/pool.js';
import { client, PACKAGE_ID } from '../sui.js';

const router = Router();
const VAULT_TYPE = () => `${PACKAGE_ID}::vault::Vault`;

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

function asAddressString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'fields' in value) {
    const fields = (value as { fields?: { bytes?: unknown; value?: unknown } }).fields;
    return asAddressString(fields?.bytes ?? fields?.value);
  }
  return undefined;
}

function sameAddress(left: string, right: string | undefined): boolean {
  return !!right && left.toLowerCase() === right.toLowerCase();
}

async function upsertVaultFromObject(owner: string, vaultId: string, fields: any) {
  const objectOwner = asAddressString(fields.owner);
  if (objectOwner && !sameAddress(owner, objectOwner)) {
    throw new Error(`Vault ${vaultId} belongs to ${objectOwner}, not ${owner}`);
  }

  const balance = asMistString(fields.balance);
  const totalDeposited = asMistString(fields.total_deposited);
  const depositCount = Number(asMistString(fields.deposit_count));

  return pool.query(
    'INSERT INTO vaults (owner, vault_id, balance, total_deposited, deposit_count, opened_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (owner) DO UPDATE SET vault_id = EXCLUDED.vault_id, balance = EXCLUDED.balance, total_deposited = EXCLUDED.total_deposited, deposit_count = EXCLUDED.deposit_count RETURNING *',
    [
      owner,
      vaultId,
      balance,
      totalDeposited,
      Number.isFinite(depositCount) ? depositCount : 0,
      fields.opened_at_ms ? new Date(Number(fields.opened_at_ms)) : new Date()
    ]
  );
}

async function syncVaultById(owner: string, vaultId: string) {
  const object = await client.getObject({
    id: vaultId,
    options: { showContent: true }
  });

  const content = object.data?.content as any;
  if (!object.data?.objectId || content?.dataType !== 'moveObject' || content?.type !== VAULT_TYPE() || !content.fields) {
    throw new Error(`Object ${vaultId} is not a Sprout vault`);
  }

  return upsertVaultFromObject(owner, object.data.objectId, content.fields);
}

async function syncVaultByOwner(owner: string) {
  const objects = await client.getOwnedObjects({
    owner,
    filter: { StructType: VAULT_TYPE() },
    options: { showContent: true }
  });

  for (const vaultObj of objects.data) {
    const vaultId = vaultObj.data?.objectId;
    const content = vaultObj.data?.content as any;
    if (vaultId && content?.dataType === 'moveObject' && content?.fields) {
      return upsertVaultFromObject(owner, vaultId, content.fields);
    }
  }

  return { rows: [] };
}

// POST /api/vaults/sync - Sync a confirmed vault object into the backend cache
router.post('/sync', async (req, res) => {
  const { owner, vaultId } = req.body ?? {};

  if (!owner || !vaultId) {
    return res.status(400).json({ error: 'owner and vaultId are required' });
  }

  if (!PACKAGE_ID) {
    console.error('[Vaults] FAILED: SPROUT_PACKAGE_ID is not configured.');
    return res.status(500).json({ error: 'Sui package is not configured' });
  }

  try {
    console.log(`[Vaults] STEP: Syncing confirmed vault ${vaultId} for owner ${owner}`);
    const result = await syncVaultById(owner, vaultId);
    const vault = result.rows[0];
    vault.total_deposited = vault.total_deposited.toString();
    vault.balance = vault.balance.toString();
    res.json(vault);
  } catch (error) {
    console.error('[Vaults] [CRITICAL] Error syncing vault:', error);
    res.status(500).json({ error: 'Vault sync failed' });
  }
});

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
          const syncResult = await syncVaultByOwner(address);

          if (syncResult.rows.length > 0) {
            result = syncResult;
            console.log(`[Vaults] COMPLETED: DB Synchronized.`);
            break; // Exit retry loop on success
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
