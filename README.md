# Dilliznt

AI-powered recruiting platform. Candidates and roles are matched automatically, interviews are synthesized, and pipeline intelligence accumulates over time.

## Setup

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm db:push      # Push schema changes to DB
pnpm db:generate  # Generate migration files
```

pnpm db:setup --reset
pnpm db:seed --reset                              
pnpm db:onboard --reset

## Stack

- **Next.js App Router** (RSC + client components)
- **Drizzle ORM** + PostgreSQL (pgmq for async events)
- **Vercel AI SDK** → OpenAI/Groq models
- **Zod** for validation (AI output + CRUD writes)

## Routes

| Route | Description |
|---|---|
| `/today` | Daily dashboard — triage items, interviews, role health |
| `/candidates`, `/candidates/[id]` | Candidate list and detail |
| `/roles`, `/roles/[id]`, `/roles/new` | Role management |
| `/interviews` | Interview tracking |
| `/offers` | Offer management |
| `/assessments` | Assessment views |
| `/pools` | Talent pools |
| `/scorecard/[id]` | Scorecard detail |
| `/compose` | Communication drafting |
| `/insights` | Analytics |

## Architecture

See [CLAUDE.md](./CLAUDE.md) for patterns, conventions, and detailed architecture docs.
