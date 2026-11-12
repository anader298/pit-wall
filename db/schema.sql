-- Production schema (Netlify Database, managed Postgres). Applied by the
-- deploy as migrations. This repo runs on the in-memory store in
-- src/store/memory.ts and does not need it; it is here to show the data
-- model the live system uses.
--
-- The sample store adds a few fields the live system keeps elsewhere:
-- company gates and axis scores (a research table), contact email evidence
-- (folded into email_source), and research items with verified numbers.
--
-- Mailbox credentials live in the creds table in production and are loaded
-- by an operator script. None are in this repository.

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  provider TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'cold',
  enabled INTEGER NOT NULL DEFAULT 1,
  spf_state TEXT, dkim_state TEXT, dmarc_state TEXT, dns_checked_on TEXT,
  warmup_required INTEGER NOT NULL DEFAULT 0,
  warmup_days INTEGER NOT NULL DEFAULT 0,
  warmup_started_on DATE,
  ramp_started_on DATE,
  notes TEXT
);
CREATE TABLE ramp_schedule (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  day_index INTEGER NOT NULL, daily_cap INTEGER NOT NULL,
  PRIMARY KEY (account_id, day_index)
);
CREATE TABLE warmup_schedule (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  day_index INTEGER NOT NULL, target_sends INTEGER NOT NULL,
  PRIMARY KEY (account_id, day_index)
);
CREATE TABLE ramp_log (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  log_date DATE NOT NULL,
  drafted INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0,
  bounced INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, log_date)
);
CREATE TABLE warmup_log (
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  log_date DATE NOT NULL,
  sends INTEGER NOT NULL DEFAULT 0, replies_received INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  PRIMARY KEY (account_id, log_date)
);
CREATE TABLE companies (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE,
  vertical TEXT, why_they_fit TEXT, confidence TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'target', domain TEXT
);
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  full_name TEXT NOT NULL, title TEXT, linkedin_url TEXT,
  email TEXT, email_confidence TEXT NOT NULL DEFAULT 'none', email_source TEXT,
  status TEXT NOT NULL DEFAULT 'new', priority INTEGER NOT NULL DEFAULT 2,
  vertical TEXT, notes TEXT
);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE TABLE suppression (
  email_key TEXT PRIMARY KEY, reason TEXT NOT NULL, contacted_at TEXT, source TEXT
);
CREATE TABLE drafts (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  account_id INTEGER REFERENCES accounts(id),
  touch INTEGER NOT NULL DEFAULT 1, variant TEXT,
  subject TEXT, body TEXT,
  state TEXT NOT NULL DEFAULT 'generated',
  scorecard JSONB, provider_msg_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE rejections (
  id SERIAL PRIMARY KEY, draft_id INTEGER REFERENCES drafts(id),
  reason TEXT NOT NULL, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE warmup_messages (
  id SERIAL PRIMARY KEY,
  from_email TEXT NOT NULL, to_email TEXT NOT NULL,
  subject TEXT NOT NULL, body TEXT NOT NULL,
  msg_id TEXT, is_reply INTEGER NOT NULL DEFAULT 0,
  replied INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE events (
  id SERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL, entity_type TEXT, entity_id INTEGER, summary TEXT NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);
CREATE TABLE creds (
  email TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  app_password TEXT,
  access_token TEXT, refresh_token TEXT, expires_at DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_drafts_state ON drafts (state);
CREATE INDEX IF NOT EXISTS idx_drafts_contact ON drafts (contact_id);
CREATE INDEX IF NOT EXISTS idx_rejections_draft ON rejections (draft_id);
CREATE INDEX IF NOT EXISTS idx_events_kind_ts ON events (kind, ts);
CREATE INDEX IF NOT EXISTS idx_warmup_messages_unreplied
  ON warmup_messages (lower(to_email), sent_at)
  WHERE replied = 0 AND is_reply = 0;
CREATE INDEX IF NOT EXISTS idx_accounts_email_lower ON accounts (lower(email));
CREATE INDEX IF NOT EXISTS idx_contacts_email_lower ON contacts (lower(email));

-- Each warmup message is opened exactly once
ALTER TABLE warmup_messages ADD COLUMN opened INTEGER NOT NULL DEFAULT 0;
