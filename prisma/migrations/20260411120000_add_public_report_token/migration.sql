ALTER TABLE "campaigns" ADD COLUMN "public_report_token" TEXT;
CREATE UNIQUE INDEX "campaigns_public_report_token_key" ON "campaigns"("public_report_token");
