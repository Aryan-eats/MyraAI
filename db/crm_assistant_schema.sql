CREATE TABLE partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL DEFAULT 'standard',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE partner_users (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('partner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  city TEXT,
  employment_type TEXT NOT NULL,
  monthly_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  existing_emi NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_loan_amount NUMERIC(12,2),
  cibil_score INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE client_notes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author_user_id TEXT NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lenders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lender_criteria (
  id TEXT PRIMARY KEY,
  lender_id TEXT NOT NULL REFERENCES lenders(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  min_cibil INTEGER,
  max_foir NUMERIC(5,2),
  min_income NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE loan_applications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  lender_id TEXT REFERENCES lenders(id),
  product_type TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  sanctioned_amount NUMERIC(12,2),
  proposed_emi NUMERIC(12,2),
  rejection_reason TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  disbursed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE application_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES loan_applications(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('missing', 'submitted', 'verified', 'rejected')),
  storage_key TEXT,
  notes TEXT,
  uploaded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE partner_daily_stats (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  stat_date DATE NOT NULL,
  leads_count INTEGER NOT NULL DEFAULT 0,
  applications_submitted INTEGER NOT NULL DEFAULT 0,
  approvals_count INTEGER NOT NULL DEFAULT 0,
  rejections_count INTEGER NOT NULL DEFAULT 0,
  docs_pending_count INTEGER NOT NULL DEFAULT 0,
  disbursals_count INTEGER NOT NULL DEFAULT 0,
  total_disbursed_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE (partner_id, stat_date)
);

CREATE TABLE assistant_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES partner_users(id) ON DELETE CASCADE,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assistant_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assistant_semantic_memory (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding JSONB,
  source_message_id TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assistant_insight_history (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  insight_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
