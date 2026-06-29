import { Router } from 'express';
import { pool } from '../db/pool.js';
import { client, PACKAGE_ID } from '../sui.js';

const router = Router();
const VAULT_TYPE = () => `${PACKAGE_ID}::vault::Vault`;

function toMistString(value: unknown): string {
  if (value == null) return '0';
  return value.toString();
}

function toIsoString(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function maxBigIntString(left: unknown, right: unknown): string {
  const leftValue = BigInt(toMistString(left));
  const rightValue = BigInt(toMistString(right));
  return (leftValue > rightValue ? leftValue : rightValue).toString();
}

async function getVaultStats(owner: string, vault: any) {
  const [depositTotals, withdrawalTotals, lastDeposit, lastWithdrawal] = await Promise.all([
    pool.query('SELECT COALESCE(SUM(amount_mist), 0) as total_deposited, COUNT(*) as deposit_count FROM deposits WHERE owner = $1', [owner]),
    pool.query('SELECT COALESCE(SUM(amount_mist), 0) as total_withdrawn, COUNT(*) as withdrawal_count FROM withdrawals WHERE owner = $1', [owner]),
    pool.query('SELECT deposited_at as occurred_at FROM deposits WHERE owner = $1 ORDER BY deposited_at DESC LIMIT 1', [owner]),
    pool.query('SELECT withdrawn_at as occurred_at FROM withdrawals WHERE owner = $1 ORDER BY withdrawn_at DESC LIMIT 1', [owner]),
  ]);

  const totalDeposited = maxBigIntString(depositTotals.rows[0]?.total_deposited, vault.total_deposited);
  const totalWithdrawn = toMistString(withdrawalTotals.rows[0]?.total_withdrawn);
  const depositCount = Math.max(Number(depositTotals.rows[0]?.deposit_count ?? 0), Number(vault.deposit_count ?? 0));
  const withdrawalCount = Number(withdrawalTotals.rows[0]?.withdrawal_count ?? 0);
  const lastDepositAt = lastDeposit.rows[0]?.occurred_at;
  const lastWithdrawalAt = lastWithdrawal.rows[0]?.occurred_at;
  const lastTransactionAt = [lastDepositAt, lastWithdrawalAt]
    .filter(Boolean)
    .map((value) => new Date(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];

  return {
    ...vault,
    balance: toMistString(vault.balance),
    total_deposited: totalDeposited,
    total_withdrawn: totalWithdrawn,
    total_profit_loss: (BigInt(toMistString(vault.balance)) + BigInt(totalWithdrawn) - BigInt(totalDeposited)).toString(),
    deposit_count: depositCount,
    withdrawal_count: withdrawalCount,
    total_transactions: depositCount + withdrawalCount,
    opened_at: toIsoString(vault.opened_at),
    last_transaction_at: toIsoString(lastTransactionAt),
    status: 'Active',
  };
}

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
    const result = await syncVaultById(owner, vaultId);
    res.json(await getVaultStats(owner, result.rows[0]));
  } catch (error) {
    console.error('[Vaults] [CRITICAL] Error syncing vault:', error);
    res.status(500).json({ error: 'Vault sync failed' });
  }
});

// GET /api/vaults/:address - Get vault summary
router.get('/:address', async (req, res) => {
  const { address } = req.params;
  try {
    let result = await pool.query('SELECT * FROM vaults WHERE owner = $1', [address]);

    if (result.rows.length === 0) {
      if (!PACKAGE_ID) {
        console.error('[Vaults] FAILED: SPROUT_PACKAGE_ID is not configured.');
        return res.status(500).json({ error: 'Sui package is not configured' });
      }

      // Resilient on-chain check with multiple attempts to handle indexer lag
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const syncResult = await syncVaultByOwner(address);

          if (syncResult.rows.length > 0) {
            result = syncResult;
            break; // Exit retry loop on success
          }

          if (attempt < 2) {
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (chainErr) {
          console.error(`[Vaults] FAILED: On-chain check error during attempt ${attempt + 1}:`, chainErr);
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const vault = result.rows[0];
    res.json(await getVaultStats(address, vault));
  } catch (error) {
    console.error('[Vaults] [CRITICAL] Error fetching vault:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/vaults/:address/transactions - Get combined transaction history
router.get('/:address/transactions', async (req, res) => {
  const { address } = req.params;
  try {
    const [depositsResult, withdrawalsResult] = await Promise.all([
      pool.query(
      'SELECT * FROM deposits WHERE owner = $1 ORDER BY deposited_at DESC LIMIT 50',
      [address]
      ),
      pool.query(
        'SELECT * FROM withdrawals WHERE owner = $1 ORDER BY withdrawn_at DESC LIMIT 50',
        [address]
      ),
    ]);

    const deposits = depositsResult.rows.map((row: any) => ({
      type: 'Deposit',
      amount_mist: toMistString(row.amount_mist),
      occurred_at: toIsoString(row.deposited_at),
      tx_digest: row.tx_digest,
      status: 'Confirmed',
      source_label: row.source_label,
    }));

    const withdrawals = withdrawalsResult.rows.map((row: any) => ({
      type: 'Withdrawal',
      amount_mist: toMistString(row.amount_mist),
      occurred_at: toIsoString(row.withdrawn_at),
      tx_digest: row.tx_digest,
      status: 'Confirmed',
      source_label: 'Withdrawal',
    }));

    res.json([...deposits, ...withdrawals].sort((left, right) => {
      return new Date(right.occurred_at ?? 0).getTime() - new Date(left.occurred_at ?? 0).getTime();
    }).slice(0, 100));
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Backward-compatible deposit history route
router.get('/:address/deposits', async (req, res) => {
  const { address } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM deposits WHERE owner = $1 ORDER BY deposited_at DESC LIMIT 50',
      [address]
    );

    res.json(result.rows.map((row: any) => ({
      ...row,
      amount_mist: toMistString(row.amount_mist),
    })));
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
