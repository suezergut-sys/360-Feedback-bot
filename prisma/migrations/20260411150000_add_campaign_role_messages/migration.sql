CREATE TABLE "campaign_role_messages" (
  "id" TEXT NOT NULL,
  "campaign_id" TEXT NOT NULL,
  "role" "RespondentRole" NOT NULL,
  "greeting_message" TEXT,
  "closing_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "campaign_role_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "campaign_role_messages_campaign_id_role_key" ON "campaign_role_messages"("campaign_id", "role");
ALTER TABLE "campaign_role_messages" ADD CONSTRAINT "campaign_role_messages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
