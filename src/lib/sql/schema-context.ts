/**
 * Recruit schema context for NL → SQL generation.
 * Static — no runtime introspection.
 */

export const RECRUIT_TABLES = [
  "dilliznt.candidates",
  "dilliznt.roles",
  "dilliznt.applications",
  "dilliznt.interviews",
  "dilliznt.offers",
  "dilliznt.engagements",
] as const;

export const RECRUIT_SCHEMA_CONTEXT = `
SCHEMA: dilliznt (PostgreSQL)

dilliznt.candidates (
  id TEXT PRIMARY KEY,          -- nanoid
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,                   -- current job title
  company TEXT,                 -- current company
  location TEXT,
  source TEXT,                  -- where sourced from
  resume_url TEXT,
  resume_text TEXT,             -- extracted resume content
  tags TEXT[],
  skills TEXT[],
  profile JSONB,                -- structured profile data
  status TEXT NOT NULL,         -- active, archived, rejected, hired
  talent_score INTEGER,         -- 0-100 headline score
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

dilliznt.roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  title TEXT NOT NULL,
  team TEXT,
  department TEXT,
  location TEXT,
  headcount INTEGER,
  status TEXT NOT NULL,         -- open, closed, paused, draft
  description TEXT,
  criteria_config JSONB,        -- scoring criteria
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

dilliznt.applications (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  role_id TEXT REFERENCES dilliznt.roles(id),
  candidate_id TEXT REFERENCES dilliznt.candidates(id),
  stage TEXT NOT NULL,          -- sourced, interview, offer, hired, rejected, withdrawn
  fit_score INTEGER,            -- 0-100
  days_in_stage INTEGER,
  source TEXT,
  recommendation TEXT,          -- advance, hold, reject
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

dilliznt.interviews (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  application_id TEXT REFERENCES dilliznt.applications(id),
  candidate_id TEXT REFERENCES dilliznt.candidates(id),
  role_id TEXT REFERENCES dilliznt.roles(id),
  interview_type TEXT,          -- phone, technical, behavioral, panel, onsite
  scheduled_at TIMESTAMPTZ,
  duration_mins INTEGER,
  status TEXT NOT NULL,         -- scheduled, completed, cancelled, no_show
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

dilliznt.offers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  application_id TEXT REFERENCES dilliznt.applications(id),
  candidate_id TEXT REFERENCES dilliznt.candidates(id),
  role_id TEXT REFERENCES dilliznt.roles(id),
  status TEXT NOT NULL,         -- draft, pending, accepted, declined, expired
  comp_base INTEGER,            -- base salary
  comp_equity INTEGER,          -- equity value
  comp_bonus INTEGER,           -- bonus
  start_date DATE,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

dilliznt.engagements (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  recipient_id TEXT,
  recipient_type TEXT,          -- candidate, interviewer
  type TEXT,                    -- email, sms, notification
  channel TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,                  -- draft, sent, delivered, opened, bounced
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

RELATIONSHIPS:
- applications.candidate_id → candidates.id
- applications.role_id → roles.id
- interviews.application_id → applications.id
- interviews.candidate_id → candidates.id
- interviews.role_id → roles.id
- offers.application_id → applications.id
- offers.candidate_id → candidates.id
- offers.role_id → roles.id

COMMON ALIASES:
- c = candidates, r = roles, a = applications, i = interviews, o = offers, e = engagements
`.trim();
