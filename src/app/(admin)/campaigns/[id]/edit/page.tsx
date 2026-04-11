import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCampaignAction, updateRoleMessagesAction, importRoleMessagesAction } from "@/app/(admin)/campaigns/actions";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { CampaignTabs } from "@/components/campaign-tabs";
import type { RespondentRole } from "@prisma/client";

const ERROR_MESSAGES: Record<string, string> = {
  campaign_validation:
    "Проверьте поля кампании: приветственное и финальное сообщения должны быть не короче 10 символов.",
};

const ROLE_LABELS: Record<RespondentRole, string> = {
  self: "Самооценка",
  manager: "Руководитель",
  colleague: "Коллеги",
  client: "Клиенты",
  employee: "Сотрудники",
};

const ALL_ROLES: RespondentRole[] = ["self", "manager", "colleague", "client", "employee"];

const NON_SELF_GREETING_DEFAULT =
  "Привет!\nСпасибо за готовность пройти опрос.\nЯ помогу собрать обратную связь на <оцениваемый сотрудник>.\nСначала мы пройдем по оценке 10 компетенций, а в конце я задам открытые вопросы, на которые ты можешь отвечать как текстовыми, так и голосовыми сообщениями (как тебе удобнее).\nТвои ответы останутся анонимными, я не сохраняю твои данные, только сами ответы.\n\nЕсли готов(а) начинать, нажми на кнопку.";

const SELF_GREETING_DEFAULT =
  "Привет!\nОцени (по шкале от 1 до 5) насколько, по твоему мнению, проявляются компетенции в твоём поведении.\n\nНажми кнопку «Начать» когда готов(а).";

function getDefaultGreeting(role: RespondentRole): string {
  return role === "self" ? SELF_GREETING_DEFAULT : NON_SELF_GREETING_DEFAULT;
}

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const admin = await requireAdminSession();
  const { id } = await params;
  const query = await searchParams;
  const errorText = query.error ? ERROR_MESSAGES[query.error] : undefined;

  const [campaign, roleMessages, allCampaigns] = await Promise.all([
    prisma.campaign.findFirst({
      where: { id, ownerAdminId: admin.id },
    }),
    prisma.campaignRoleMessage.findMany({
      where: { campaignId: id },
    }),
    prisma.campaign.findMany({
      where: { ownerAdminId: admin.id, id: { not: id } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!campaign) {
    notFound();
  }

  const roleMessageMap = Object.fromEntries(
    roleMessages.map((m) => [m.role, m]),
  ) as Partial<Record<RespondentRole, { greetingMessage: string | null; closingMessage: string | null }>>;

  return (
    <section className="stack-lg">
      <div className="row-between">
        <h2>{campaign.title}</h2>
        <Link href="/campaigns" className="link-inline">
          Назад к списку
        </Link>
      </div>

      <CampaignTabs campaignId={campaign.id} />

      {errorText ? <p className="error-text">{errorText}</p> : null}

      <form action={updateCampaignAction} className="card form-grid">
        <input type="hidden" name="campaignId" value={campaign.id} />

        <label className="form-label" htmlFor="title">
          Название
        </label>
        <input id="title" name="title" className="input" defaultValue={campaign.title} required />

        <label className="form-label" htmlFor="description">
          Описание
        </label>
        <textarea
          id="description"
          name="description"
          className="textarea"
          defaultValue={campaign.description}
          rows={3}
          required
        />

        <label className="form-label" htmlFor="subjectName">
          Оцениваемый сотрудник
        </label>
        <input
          id="subjectName"
          name="subjectName"
          className="input"
          defaultValue={campaign.subjectName}
          required
        />

        <label className="form-label" htmlFor="status">
          Статус
        </label>
        <select id="status" name="status" className="input" defaultValue={campaign.status}>
          <option value="draft">draft</option>
          <option value="active">active</option>
          <option value="paused">paused</option>
          <option value="completed">completed</option>
          <option value="archived">archived</option>
        </select>

        <label className="form-label" htmlFor="language">
          Язык
        </label>
        <input id="language" name="language" className="input" defaultValue={campaign.language} required />

        <label className="form-label" htmlFor="welcomeMessage">
          Welcome message (запасной)
        </label>
        <textarea
          id="welcomeMessage"
          name="welcomeMessage"
          className="textarea"
          defaultValue={campaign.welcomeMessage}
          minLength={10}
          rows={4}
          required
        />

        <label className="form-label" htmlFor="closingMessage">
          Closing message (запасной)
        </label>
        <textarea
          id="closingMessage"
          name="closingMessage"
          className="textarea"
          defaultValue={campaign.closingMessage}
          minLength={10}
          rows={4}
          required
        />

        <button className="button primary" type="submit">
          Сохранить изменения
        </button>
      </form>

      {/* Role-specific messages */}
      <div className="card" style={{ padding: "24px" }}>
        <h3 style={{ marginBottom: "4px", fontSize: "15px", fontWeight: 700 }}>Сообщения по ролям</h3>
        <p className="muted small" style={{ marginBottom: "20px" }}>
          Приветствие и завершающее сообщение для каждой роли. Оставьте поле пустым — будет использован запасной текст выше.
          В тексте используйте <code>&lt;оцениваемый сотрудник&gt;</code> для подстановки имени.
        </p>

        <form action={updateRoleMessagesAction} className="stack-lg">
          <input type="hidden" name="campaignId" value={campaign.id} />

          {ALL_ROLES.map((role) => {
            const existing = roleMessageMap[role];
            const greetingVal = existing?.greetingMessage ?? getDefaultGreeting(role);
            const closingVal = existing?.closingMessage ?? "";
            return (
              <details key={role} style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: "16px" }}>
                <summary style={{ fontWeight: 600, fontSize: "13px", cursor: "pointer", padding: "8px 0" }}>
                  {ROLE_LABELS[role]}
                </summary>
                <div className="form-grid" style={{ marginTop: "12px" }}>
                  <label className="form-label" htmlFor={`greeting_${role}`}>
                    Приветствие
                  </label>
                  <textarea
                    id={`greeting_${role}`}
                    name={`greeting_${role}`}
                    className="textarea"
                    defaultValue={greetingVal}
                    rows={6}
                  />
                  <label className="form-label" htmlFor={`closing_${role}`}>
                    Завершение
                  </label>
                  <textarea
                    id={`closing_${role}`}
                    name={`closing_${role}`}
                    className="textarea"
                    defaultValue={closingVal}
                    rows={3}
                    placeholder={`По умолчанию: «${campaign.closingMessage.slice(0, 60)}…»`}
                  />
                </div>
              </details>
            );
          })}

          <button className="button primary" type="submit">
            Сохранить сообщения по ролям
          </button>
        </form>
      </div>

      {/* Import messages from another campaign */}
      {allCampaigns.length > 0 && (
        <div className="card" style={{ padding: "24px" }}>
          <h3 style={{ marginBottom: "4px", fontSize: "15px", fontWeight: 700 }}>Импортировать тексты</h3>
          <p className="muted small" style={{ marginBottom: "16px" }}>
            Скопировать сообщения по ролям из другой кампании в текущую.
          </p>
          <form action={importRoleMessagesAction} style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="campaignId" value={campaign.id} />
            <select name="sourceCampaignId" className="input" style={{ flex: 1, minWidth: "200px" }}>
              {allCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button className="button" type="submit">
              Импортировать тексты
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
