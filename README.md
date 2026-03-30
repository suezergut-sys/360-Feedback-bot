# 360 Feedback AI Bot

Production-oriented MVP of a Telegram-based 360 feedback system with:
- AI interviewer in Telegram (text + voice input)
- Admin panel in Next.js
- PostgreSQL + Prisma structured storage
- OpenAI-based extraction and reporting
- Job processing compatible with serverless/Vercel

## Stack
- Next.js App Router + TypeScript
- PostgreSQL + Prisma
- Telegram Bot API (webhook)
- OpenAI API (interview/extraction/report + transcription)
- Zod validation
- Optional Upstash Redis / Vercel KV for idempotency, rate limits, locks
- Vitest for core unit tests

## Main capabilities

### Admin panel
- Admin login
- Campaign list / create / edit
- Competencies management
- Manual respondent management
- Invite link generation
- Progress dashboard
- Raw responses viewer
- Reports viewer
- Manual report re-trigger

### Telegram bot flow
- `/start <token>` invite validation
- Consent checkpoint
- Interview in Russian with fixed methodology by competency
- Text and voice answers supported
- Voice -> transcription (audio file deleted after processing)
- Resume support via persisted interview state
- `/resume`, `/help`, `/finish`

### Analysis/reporting
- Extraction mode: structured competency evidence from raw answers
- Report mode:
  - Competency reports
  - Overall campaign report
- Structured JSON intermediate artifacts stored in DB
- Retryable job execution with soft locking

## Project structure

```text
/src
  /app
    /(auth)/login
    /(admin)/campaigns
    /api/telegram/webhook
    /api/cron/jobs
    /api/health
  /components
  /lib
    /auth
    /audio
    /db
    /jobs
    /kv
    /logging
    /openai
    /security
    /telegram
    /validators
  /modules
    /campaigns
    /competencies
    /interviews
    /reports
    /respondents
  /prompts
  /types
  /utils
/prisma
/docs
/scripts
```

## Data model (Prisma)
Implemented entities:
- `Admin`
- `Campaign`
- `Competency`
- `Respondent`
- `InterviewSession`
- `Message`
- `CompetencyFeedback`
- `AnalysisReport`
- `Job`
- `TelegramUpdateLog` (idempotency dedupe)

Migration included: `prisma/migrations/20260323180000_init/migration.sql`

## Environment variables
Use `.env.example`:

```env
DATABASE_URL=
OPENAI_API_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=
APP_BASE_URL=
AUTH_SECRET=
CRON_SECRET=

KV_REST_API_URL=
KV_REST_API_TOKEN=
```

Notes:
- KV vars are optional.
- Core business data is always stored in PostgreSQL.
- `TELEGRAM_BOT_USERNAME` is optional, but recommended for direct `t.me` invite links.

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
# fill values
```

3. Run migration:

```bash
npm run prisma:migrate:dev
```

4. Generate Prisma client (if needed):

```bash
npm run prisma:generate
```

5. Seed demo data:

```bash
npm run prisma:seed
```

Seed creates:
- admin `admin@360bot.local`
- password `ChangeMe123!`
- one demo campaign with competencies + respondents

6. Start app:

```bash
npm run dev
```

## Telegram webhook setup

Assuming deployment URL is `https://your-app.vercel.app`:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Check status:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Cron / job processing

Endpoint:
- `POST /api/cron/jobs`
- Header: `Authorization: Bearer <CRON_SECRET>`

Example:

```bash
curl -X POST "https://your-app.vercel.app/api/cron/jobs" \
  -H "Authorization: Bearer <CRON_SECRET>"
```

On Vercel, configure a scheduled job to call this endpoint.

## OpenAI integration

Implemented modes:
- Interview mode (`generateInterviewDecision`)
- Extraction mode (`extractCompetencyFeedback`)
- Report mode (`generateCompetencyReport`, `generateOverallReport`)
- Transcription (`transcribeTelegramVoice`)

All AI boundary payloads are validated with Zod.

## Optional KV integration

If KV is configured:
- Telegram update idempotency cache
- Rate limiting
- Soft lock for report generation

If KV is not configured:
- System still runs using DB fallback and local in-memory fallbacks where appropriate.

## Auth/security implemented
- Password-based admin auth (`bcryptjs`)
- Signed admin session cookie (`jose`)
- Protected admin routes
- Telegram webhook secret validation
- Rate limiting helper
- Prompt-safety sanitization for interview context
- Structured JSON logs
- Zod input validation on external boundaries

## Tests

Run:

```bash
npm test
```

Current tests cover:
- Invite token validation
- Interview state transitions
- Extraction schema parsing
- Report assembly utilities

## Build & verification

```bash
npm run lint
npm test
npm run build
```

A Windows `readlink` filesystem behavior is patched via `scripts/readlink-patch.cjs` and `NODE_OPTIONS` in npm scripts. This keeps local build stable in directories where Node returns `EISDIR` for `readlink` on regular files.

## Vercel deployment

1. Push repository to GitHub.
2. Import project in Vercel.
3. Set all required environment variables in Vercel.
4. Provision PostgreSQL and set `DATABASE_URL`.
5. Run migrations in deploy pipeline or manually:

```bash
npm run prisma:migrate
npm run prisma:generate
```

6. Seed once if desired (manual run):

```bash
npm run prisma:seed
```

7. Configure Telegram webhook to production URL.
8. Configure Vercel Cron for `/api/cron/jobs`.

## MVP limitations
- Single admin scope (no multi-tenant RBAC)
- Fixed interview methodology (not configurable yet)
- No PDF/DOCX export
- No quantitative scoring
- No automated reminder workflow by default
- No respondent role segmentation
- No advanced audit trail UI

## Health endpoint
- `GET /api/health`

## License
Internal MVP / project template.
