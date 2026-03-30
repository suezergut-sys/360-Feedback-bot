# Architecture Notes

## Runtime model
- Next.js App Router hosts both admin UI and backend endpoints.
- Telegram updates arrive via webhook and are processed idempotently.
- Core state is persisted to PostgreSQL on every interaction.
- Heavy analysis/report work is queued in `Job` table and executed by cron-triggered processor endpoint.

## Persistence boundaries
- PostgreSQL (Prisma) stores all business entities and final artifacts.
- Upstash/Vercel KV is optional and only used for ephemeral controls:
  - short-lived idempotency keys
  - rate limiting counters
  - soft locks

## Interview pipeline
1. Validate invite token.
2. Link respondent to Telegram account.
3. Persist inbound message.
4. For voice input, transcribe with OpenAI and discard temp audio.
5. Generate next interviewer turn with OpenAI interview mode + persisted state.
6. Persist assistant message + updated state.

## Analysis pipeline
1. `extract_feedback` job runs structured extraction per respondent x competency.
2. Extracted data is upserted into `CompetencyFeedback`.
3. `generate_reports` job aggregates feedback and creates:
   - competency reports
   - overall campaign report
4. Reports are versioned and stored in `AnalysisReport`.

## Security highlights
- Signed HTTP-only admin sessions.
- Protected admin routes.
- Telegram secret header validation.
- Zod validation for API inputs and model outputs.
- Prompt-safety sanitization of respondent text before LLM contexting.
