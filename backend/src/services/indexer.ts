import { client, PACKAGE_ID } from '../sui.js';
import { pool } from '../db/pool.js';
import dotenv from 'dotenv';

dotenv.config();

async function getCursor() {
  const res = await pool.query('SELECT last_seq FROM indexer_cursor WHERE id = 1');
  return res.rows[0]?.last_seq;
}

async function saveCursor(cursor: string) {
  await pool.query('UPDATE indexer_cursor SET last_seq = $1, updated_at = now() WHERE id = 1', [cursor]);
}

async function indexEvents() {
  let cursor = await getCursor();

  while (true) {
    try {
      const { data, nextCursor, hasNextPage } = await client.queryEvents({
        query: { MoveModule: { package: PACKAGE_ID, module: 'vault' } },
        cursor: cursor ? { txDigest: cursor.split(':')[0], eventSeq: cursor.split(':')[1] } : undefined,
        order: 'ascending',
      });

      for (const event of data) {
        const { type, parsedJson, id } = event;
        const eventType = type.split('::').pop();
        const txDigest = id.txDigest;

        if (eventType === 'VaultOpened') {
          const { vault_id, owner } = parsedJson as any;
          await pool.query(
            'INSERT INTO vaults (owner, vault_id, opened_at) VALUES ($1, $2, $3) ON CONFLICT (owner) DO NOTHING',
            [owner, vault_id, new Date(Number(event.timestampMs))]
          );
        } else if (eventType === 'RoundupDeposited') {
          const { vault_id, owner, amount, total_deposited } = parsedJson as any;

          await pool.query('BEGIN');
          try {
            const inserted = await pool.query(
              'INSERT INTO deposits (owner, vault_id, amount_mist, source_label, tx_digest, deposited_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tx_digest) DO NOTHING RETURNING id',
              [owner, vault_id, amount, (parsedJson as any).source_label || 'round-up', txDigest, new Date(Number(event.timestampMs))]
            );

            if (inserted.rows.length > 0) {
              await pool.query(
                'UPDATE vaults SET balance = balance + $1, total_deposited = $2, deposit_count = deposit_count + 1 WHERE owner = $3',
                [amount, total_deposited, owner]
              );
              await pool.query(
                'UPDATE pending_roundups SET deposited = TRUE WHERE owner = $1 AND deposited = FALSE',
                [owner]
              );
            }
            await pool.query('COMMIT');
          } catch (e) {
            await pool.query('ROLLBACK');
            throw e;
          }
        } else if (eventType === 'Withdrawn') {
          const { vault_id, owner, amount, fee } = parsedJson as any;
          await pool.query('BEGIN');
          try {
            const inserted = await pool.query(
              'INSERT INTO withdrawals (owner, vault_id, amount_mist, fee_mist, tx_digest, withdrawn_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tx_digest) DO NOTHING RETURNING id',
              [owner, vault_id, amount, fee, txDigest, new Date(Number(event.timestampMs))]
            );

            if (inserted.rows.length > 0) {
              await pool.query(
                'UPDATE vaults SET balance = balance - $1 WHERE owner = $2',
                [amount, owner]
              );
            }
            await pool.query('COMMIT');
          } catch (e) {
            await pool.query('ROLLBACK');
            throw e;
          }
        }

        cursor = `${id.txDigest}:${id.eventSeq}`;
        await saveCursor(cursor);
      }

      if (!hasNextPage) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        cursor = `${nextCursor!.txDigest}:${nextCursor!.eventSeq}`;
        await saveCursor(cursor);
      }
    } catch (error) {
      console.error('Indexer error:', error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

indexEvents();
