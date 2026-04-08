-- CreateTable: competency_templates (global library of reusable competencies)
CREATE TABLE "competency_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "group_name" TEXT,
    "priority_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competency_templates_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "competency_templates_priority_order_idx" ON "competency_templates"("priority_order");

-- CreateTable: competency_ratings (button-based 1-5/NA ratings per respondent per competency)
CREATE TABLE "competency_ratings" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "respondent_id" TEXT NOT NULL,
    "competency_id" TEXT NOT NULL,
    "rating" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competency_ratings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competency_ratings_respondent_id_competency_id_key" ON "competency_ratings"("respondent_id", "competency_id");
CREATE INDEX "competency_ratings_campaign_id_competency_id_idx" ON "competency_ratings"("campaign_id", "competency_id");

-- AddForeignKey
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "respondents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competency_ratings" ADD CONSTRAINT "competency_ratings_competency_id_fkey" FOREIGN KEY ("competency_id") REFERENCES "competencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
