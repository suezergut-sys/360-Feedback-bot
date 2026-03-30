import { PrismaClient, CampaignStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const DEMO_EMAIL = "admin@360bot.local";
const DEMO_PASSWORD = "ChangeMe123!";

async function main() {
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
          "Спасибо, что участвуете в 360-интервью. Я ИИ-интервьюер и задам серию коротких вопросов по компетенциям.",
        closingMessage:
          "Спасибо за подробную обратную связь. Ваши ответы будут включены в итоговый отчет.",
      },
    });

    await prisma.competency.createMany({
      data: [
        {
          campaignId: campaign.id,
          name: "Лидерство",
          description: "Как человек задает направление и поддерживает команду.",
          behavioralMarkers: ["формулирует приоритеты", "поддерживает вовлеченность"],
          priorityOrder: 1,
          enabled: true,
        },
        {
          campaignId: campaign.id,
          name: "Коммуникация",
          description: "Ясность коммуникаций, своевременность и качество обратной связи.",
          behavioralMarkers: ["объясняет решения", "прозрачно поднимает риски"],
          priorityOrder: 2,
          enabled: true,
        },
        {
          campaignId: campaign.id,
          name: "Ответственность",
          description: "Готовность брать обязательства и доводить задачи до результата.",
          behavioralMarkers: ["держит договоренности", "признает ошибки"],
          priorityOrder: 3,
          enabled: true,
        },
      ],
    });

    await prisma.respondent.createMany({
      data: [
        { campaignId: campaign.id, displayName: "Ирина Петрова", inviteToken: crypto.randomUUID() },
        { campaignId: campaign.id, displayName: "Максим Орлов", inviteToken: crypto.randomUUID() },
        { campaignId: campaign.id, displayName: "Ольга Смирнова", inviteToken: crypto.randomUUID() },
      ],
    });
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
