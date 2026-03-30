-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "RespondentStatus" AS ENUM ('invited', 'started', 'completed');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('respondent', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'voice', 'system');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('overall', 'competency');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "owner_admin_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "language" TEXT NOT NULL DEFAULT 'ru',
    "welcome_message" TEXT NOT NULL,
    "closing_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competencies" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "behavioral_markers_json" JSONB NOT NULL,
    "priority_order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "competencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "respondents" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "telegram_user_id" BIGINT,
    "telegram_username" TEXT,
    "display_name" TEXT,
    "invite_token" TEXT NOT NULL,
    "status" "RespondentStatus" NOT NULL DEFAULT 'invited',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "respondents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "current_state" JSONB NOT NULL,
    "current_competency_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "competency_id" TEXT,
    "sender_type" "SenderType" NOT NULL,
    "telegram_message_id" INTEGER,
    "message_type" "MessageType" NOT NULL,
    "raw_text" TEXT,
    "transcript_text" TEXT,
    "normalized_text" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competency_feedback" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "evidence_summary" TEXT NOT NULL,
    "strengths_text" TEXT NOT NULL,
    "growth_areas_text" TEXT NOT NULL,
    "examples_text" TEXT NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "source_message_ids_json" JSONB NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "competency_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analysis_reports" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "competency_id" TEXT,
    "content_markdown" TEXT NOT NULL,
    "content_json" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "analysis_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_update_logs" (
    "id" TEXT NOT NULL,
    "update_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_update_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");
CREATE INDEX "campaigns_owner_admin_id_idx" ON "campaigns"("owner_admin_id");
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX "competencies_campaign_id_priority_order_idx" ON "competencies"("campaign_id", "priority_order");
CREATE UNIQUE INDEX "respondents_invite_token_key" ON "respondents"("invite_token");
CREATE INDEX "respondents_campaign_id_status_idx" ON "respondents"("campaign_id", "status");
CREATE INDEX "respondents_telegram_user_id_idx" ON "respondents"("telegram_user_id");
CREATE UNIQUE INDEX "interview_sessions_campaign_id_respondent_id_key" ON "interview_sessions"("campaign_id", "respondent_id");
CREATE INDEX "interview_sessions_campaign_id_completed_at_idx" ON "interview_sessions"("campaign_id", "completed_at");
CREATE INDEX "messages_session_id_created_at_idx" ON "messages"("session_id", "created_at");
CREATE INDEX "messages_telegram_message_id_idx" ON "messages"("telegram_message_id");
CREATE UNIQUE INDEX "competency_feedback_campaign_id_respondent_id_competency_id_key" ON "competency_feedback"("campaign_id", "respondent_id", "competency_id");
CREATE INDEX "competency_feedback_campaign_id_competency_id_idx" ON "competency_feedback"("campaign_id", "competency_id");
CREATE INDEX "analysis_reports_campaign_id_report_type_created_at_idx" ON "analysis_reports"("campaign_id", "report_type", "created_at");
CREATE INDEX "jobs_status_run_at_idx" ON "jobs"("status", "run_at");
CREATE UNIQUE INDEX "telegram_update_logs_update_id_key" ON "telegram_update_logs"("update_id");

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_admin_id_fkey" FOREIGN KEY ("owner_admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competencies" ADD CONSTRAINT "competencies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "respondents" ADD CONSTRAINT "respondents_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "respondents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_current_competency_id_fkey" FOREIGN KEY ("current_competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "competency_feedback" ADD CONSTRAINT "competency_feedback_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competency_feedback" ADD CONSTRAINT "competency_feedback_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "respondents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competency_feedback" ADD CONSTRAINT "competency_feedback_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_reports" ADD CONSTRAINT "analysis_reports_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
