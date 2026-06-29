-- Sprout Backend Schema

CREATE TABLE IF NOT EXISTS vaults (
  owner           TEXT PRIMARY KEY,
  vault_id        TEXT UNIQUE NOT NULL,
  total_deposited BIGINT NOT NULL DEFAULT 0,
  balance         BIGINT NOT NULL DEFAULT 0,
  deposit_count   INT NOT NULL DEFAULT 0,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deposits (
  id            SERIAL PRIMARY KEY,
  owner         TEXT NOT NULL REFERENCES vaults(owner),
  vault_id      TEXT NOT NULL,
  amount_mist   BIGINT NOT NULL,
  source_label  TEXT NOT NULL DEFAULT 'round-up',
  deposited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_digest     TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS pending_roundups (
  id            SERIAL PRIMARY KEY,
  owner         TEXT NOT NULL,
  amount_mist   BIGINT NOT NULL,
  source_label  TEXT NOT NULL DEFAULT 'purchase round-up',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deposited     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id          SERIAL PRIMARY KEY,
  owner       TEXT NOT NULL REFERENCES vaults(owner),
  vault_id    TEXT,
  amount_mist BIGINT NOT NULL,
  fee_mist    BIGINT NOT NULL,
  withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tx_digest   TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS indexer_cursor (
  id         INT PRIMARY KEY DEFAULT 1,
  last_seq   TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO indexer_cursor (id, last_seq, updated_at) 
VALUES (1, NULL, now()) 
ON CONFLICT (id) DO NOTHING;
