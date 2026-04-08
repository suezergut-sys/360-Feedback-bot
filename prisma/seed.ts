import { PrismaClient, CampaignStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { COMPETENCY_TEMPLATES } from "../src/data/competency-templates";

const prisma = new PrismaClient();

const DEMO_EMAIL = "admin@360bot.local";
const DEMO_PASSWORD = "ChangeMe123!";

async function seedCompetencyTemplates() {
  for (const template of COMPETENCY_TEMPLATES) {
    await prisma.competencyTemplate.upsert({
      where: {
        // upsert by name since there's no unique constraint — use findFirst pattern instead
        id: `template-${template.priorityOrder}`,
      },
      update: {
        name: template.name,
        description: template.description,
        groupName: template.groupName,
        priorityOrder: template.priorityOrder,
      },
      create: {
        id: `template-${template.priorityOrder}`,
        name: template.name,
        description: template.description,
        groupName: template.groupName,
        priorityOrder: template.priorityOrder,
      },
    });
  }

  console.log(`Seeded ${COMPETENCY_TEMPLATES.length} competency templates.`);
}

async function main() {
  await seedCompetencyTemplates();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const admin = await prisma.admin.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      name: "MVP Admin",
      passwordHash,
    },
    create: {
      email: DEMO_EMAIL,
      name: "MVP Admin",
      passwordHash,
    },
  });

  const existingCampaign = await prisma.campaign.findFirst({
    where: { ownerAdminId: admin.id, title: "Демо 360: Руководитель продукта" },
    include: { competencies: true, respondents: true },
  });

  if (!existingCampaign) {
    const campaign = await prisma.campaign.create({
      data: {
        ownerAdminId: admin.id,
        title: "Демо 360: Руководитель продукта",
        description: "Пилотный цикл качественной обратной связи от коллег.",
        subjectName: "Алексей Иванов",
        status: CampaignStatus.active,
        language: "ru",
        welcomeMessage:
          "Спасибо, что участвуете в опросе 360°. Вам предстоит оценить руководителя по 10 компетенциям, а также ответить на несколько открытых вопросов.",
        closingMessage:
          "Спасибо за подробную обратную связь. Ваши ответы будут включены в итоговый отчёт.",
        competencies: {
          create: COMPETENCY_TEMPLATES.map((t) => ({
            name: t.name,
            description: t.description,
            groupName: t.groupName,
            priorityOrder: t.priorityOrder,
            behavioralMarkers: [],
            enabled: true,
          })),
        },
      },
    });

    await prisma.respondent.createMany({
      data: [
        { campaignId: campaign.id, displayName: "Ирина Петрова", inviteToken: crypto.randomUUID() },
        { campaignId: campaign.id, displayName: "Максим Орлов", inviteToken: crypto.randomUUID() },
        { campaignId: campaign.id, displayName: "Ольга Смирнова", inviteToken: crypto.randomUUID() },
      ],
    });

    console.log(`Demo campaign created: ${campaign.id}`);
  }

  console.log("Seed complete.");
  console.log(`Admin email: ${DEMO_EMAIL}`);
  console.log(`Admin password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
