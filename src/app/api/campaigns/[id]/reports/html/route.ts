import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAdminSessionFromCookies } from "@/lib/auth/session";
import { buildVisualReportData, type VisualCompetencyData, type RespondentRole } from "@/modules/reports/assembly";
import { OPEN_QUESTIONS } from "@/modules/interviews/state";

const ROLE_LABELS: Record<RespondentRole, string> = {
  self: "Самооценка",
  manager: "Руководитель",
  colleague: "Коллеги",
  client: "Клиенты",
};

const ALL_ROLES: RespondentRole[] = ["self", "manager", "colleague", "client"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const printMode = new URL(req.url).searchParams.get("print") === "1";
  const session = await getAdminSessionFromCookies();
  if (!session) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { id: true },
  });
  if (!admin) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerAdminId: admin.id },
    select: { id: true, title: true, subjectName: true, updatedAt: true },
  });

  if (!campaign) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const [competencies, respondents, ratings, openMessages] = await Promise.all([
    prisma.competency.findMany({
      where: { campaignId: id, enabled: true },
      select: { id: true, name: true, description: true, groupName: true, priorityOrder: true, behavioralMarkers: true },
      orderBy: { priorityOrder: "asc" },
    }),
    prisma.respondent.findMany({
      where: { campaignId: id },
      select: { id: true, displayName: true, role: true, position: true, department: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.competencyRating.findMany({
      where: { campaignId: id },
      select: { respondentId: true, competencyId: true, rating: true },
    }),
    prisma.message.findMany({
      where: {
        session: { campaignId: id },
        senderType: "respondent",
      },
      select: {
        session: { select: { respondentId: true } },
        transcriptText: true,
        rawText: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const openAnswersByRespondent = new Map<string, string[]>();
  for (const msg of openMessages) {
    const rid = msg.session.respondentId;
    const text = (msg.transcriptText ?? msg.rawText ?? "").trim();
    if (!text) continue;
    if (!openAnswersByRespondent.has(rid)) openAnswersByRespondent.set(rid, []);
    openAnswersByRespondent.get(rid)!.push(text);
  }

  const data = buildVisualReportData(
    { name: campaign.subjectName, title: campaign.title },
    competencies,
    respondents,
    ratings,
    openAnswersByRespondent,
  );

  const totalRespondents = respondents.length;
  const completedRespondents = respondents.filter((r) => r.status === "completed").length;
  const hasData = ratings.length > 0;

  const expertsByRole = ALL_ROLES.reduce(
    (acc, role) => {
      acc[role] = data.experts.filter((e) => e.role === role);
      return acc;
    },
    {} as Record<RespondentRole, typeof data.experts>,
  );

  const html = buildHtml({
    campaign,
    data,
    respondents,
    expertsByRole,
    totalRespondents,
    completedRespondents,
    hasData,
    printMode,
  });

  const filename = `report-${campaign.subjectName.replace(/[^a-zA-Zа-яА-Я0-9]/g, "_")}.html`;

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
  };

  if (!printMode) {
    headers["Content-Disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }

  return new NextResponse(html, { status: 200, headers });
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml({
  campaign,
  data,
  respondents,
  expertsByRole,
  totalRespondents,
  completedRespondents,
  hasData,
  printMode,
}: {
  campaign: { title: string; subjectName: string; updatedAt: Date };
  data: ReturnType<typeof buildVisualReportData>;
  respondents: { role: string; status: string }[];
  expertsByRole: Record<RespondentRole, typeof data.experts>;
  totalRespondents: number;
  completedRespondents: number;
  hasData: boolean;
  printMode: boolean;
}): string {
  const dateStr = campaign.updatedAt.toLocaleDateString("ru-RU");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Отчёт — ${esc(campaign.subjectName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; }
  .vr-page { max-width: 960px; margin: 0 auto; padding: 32px 24px; }
  .vr-cover { min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 48px 0 32px; border-bottom: 2px solid #e2e8f0; margin-bottom: 32px; }
  .vr-cover-title { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
  .vr-cover-name { font-size: 28px; font-weight: 700; margin-bottom: 20px; }
  .vr-cover-meta { display: grid; gap: 6px; font-size: 13px; }
  .vr-cover-meta-row { display: flex; gap: 16px; justify-content: center; }
  .vr-cover-meta strong { font-weight: 600; }
  .vr-section { margin-bottom: 40px; }
  .vr-section-title { font-size: 15px; font-weight: 700; background: #f1f5f9; padding: 8px 12px; margin-bottom: 16px; border-left: 4px solid #3b82f6; }
  .vr-group-title { font-size: 13px; font-weight: 700; background: #e2e8f0; padding: 6px 12px; margin: 16px 0 8px; }
  .vr-experts-group { margin-bottom: 16px; }
  .vr-experts-group-header { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
  .vr-experts-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .vr-experts-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .vr-experts-table td:first-child { font-weight: 600; width: 220px; }
  .vr-empty { color: #94a3b8; font-size: 12px; padding: 8px 0; font-style: italic; }
  .vr-comp-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; gap: 12px; }
  .vr-comp-name { width: 260px; flex-shrink: 0; font-size: 12px; font-weight: 500; }
  .vr-bar-wrap { flex: 1; display: flex; align-items: center; gap: 10px; }
  .vr-bar-label { font-size: 11px; color: #64748b; width: 24px; text-align: right; flex-shrink: 0; }
  .vr-bar-label.right { text-align: left; }
  .vr-bar-track { flex: 1; height: 12px; background: #f1f5f9; border-radius: 6px; position: relative; display: flex; overflow: hidden; }
  .vr-bar-dev { background: #f97316; height: 100%; }
  .vr-bar-str { background: #22c55e; height: 100%; margin-left: auto; }
  .vr-bar-dot { position: absolute; top: 50%; transform: translate(-50%, -50%); width: 14px; height: 14px; border-radius: 50%; background: #fff; border: 2px solid #64748b; z-index: 2; }
  .vr-legend { display: flex; gap: 24px; margin-bottom: 12px; font-size: 11px; color: #64748b; }
  .vr-legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .vr-matrix { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  .vr-matrix th, .vr-matrix td { padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; }
  .vr-matrix th { background: #f8fafc; font-weight: 600; }
  .vr-matrix td:first-child { text-align: left; font-weight: 500; width: 240px; }
  .vr-badge-dev { display: inline-flex; align-items: center; justify-content: center; background: #fff3e0; color: #ea580c; border: 1px solid #fed7aa; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 700; min-width: 22px; }
  .vr-badge-str { display: inline-flex; align-items: center; justify-content: center; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 700; min-width: 22px; }
  .vr-dash { color: #cbd5e1; }
  .vr-top5-section { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .vr-top5-title { font-weight: 700; font-size: 13px; margin-bottom: 10px; }
  .vr-top5-title.dev { color: #ea580c; }
  .vr-top5-title.str { color: #16a34a; }
  .vr-top5-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px; }
  .vr-top5-name { width: 200px; flex-shrink: 0; }
  .vr-top5-count { width: 20px; flex-shrink: 0; font-weight: 700; text-align: right; }
  .vr-top5-bar { height: 10px; border-radius: 4px; }
  .vr-top5-bar.dev { background: #f97316; }
  .vr-top5-bar.str { background: #22c55e; }
  .vr-reco-respondent { margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
  .vr-reco-name { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #1e293b; }
  .vr-reco-qa { margin-bottom: 8px; }
  .vr-reco-question { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: #64748b; margin-bottom: 3px; }
  .vr-reco-answer { font-size: 12px; color: #334155; padding: 4px 0 4px 12px; border-left: 2px solid #3b82f6; font-style: italic; }
  .vr-no-data { color: #94a3b8; font-size: 12px; font-style: italic; }
  .vr-no-feedback { padding: 32px; text-align: center; color: #94a3b8; border: 1px dashed #e2e8f0; border-radius: 8px; margin-bottom: 32px; }
  @media print {
    .vr-cover { page-break-after: always; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  }
</style>
${printMode ? `<script>window.addEventListener("load", function(){ window.print(); });</script>` : ""}
</head>
<body>
<div class="vr-page">

  <div class="vr-cover">
    <div class="vr-cover-title">Отчёт по результатам</div>
    <div class="vr-cover-name">${esc(campaign.subjectName)}</div>
    <div class="vr-cover-meta">
      <div class="vr-cover-meta-row"><span><strong>Наименование опроса:</strong> ${esc(campaign.title)}</span></div>
      <div class="vr-cover-meta-row"><span><strong>Дата формирования:</strong> ${esc(dateStr)}</span></div>
      <div class="vr-cover-meta-row"><span><strong>Экспертов завершили:</strong> ${completedRespondents} из ${totalRespondents}</span></div>
    </div>
  </div>

  <div class="vr-section">
    <div class="vr-section-title">Эксперты</div>
    ${ALL_ROLES.map((role) => {
      const group = expertsByRole[role];
      if (group.length === 0) return "";
      const completed = group.filter((e) => e.status === "completed").length;
      return `<div class="vr-experts-group">
        <div class="vr-experts-group-header">${esc(ROLE_LABELS[role])} (оценили ${completed} из ${group.length})</div>
        <table class="vr-experts-table"><tbody>
          ${group.map((e) => `<tr><td>${esc(e.displayName)}</td><td>${esc(e.department) || "—"}</td><td>${esc(e.position) || "—"}</td></tr>`).join("")}
        </tbody></table>
      </div>`;
    }).join("")}
    ${data.experts.length === 0 ? '<div class="vr-empty">Респонденты не добавлены.</div>' : ""}
  </div>

  ${!hasData ? `<div class="vr-no-feedback">Данные обратной связи ещё не получены. Дождитесь завершения интервью.</div>` : `

  <div class="vr-section">
    <div class="vr-section-title">Результаты обратной связи</div>
    <div class="vr-legend">
      <span><span class="vr-legend-dot" style="background:#f97316"></span>Зона для развития (оценка 1–2)</span>
      <span><span class="vr-legend-dot" style="background:#22c55e"></span>Сильная сторона (оценка 4–5)</span>
    </div>
    ${data.competencyGroups.map((group) => `
      <div class="vr-group-title">${esc(group.groupName)}</div>
      ${group.competencies.map((comp) => renderCompetencyBar(comp)).join("")}
    `).join("")}
  </div>

  <div class="vr-section">
    <div class="vr-section-title">Оценка по группам</div>
    <div class="vr-legend">
      <span><span class="vr-badge-dev">1</span> — зона для развития</span>
      <span><span class="vr-badge-str">1</span> — сильная сторона</span>
      <span><span class="vr-dash">—</span> — не выбрано</span>
    </div>
    ${data.competencyGroups.map((group) => `
      <div class="vr-group-title">${esc(group.groupName)}</div>
      ${renderGroupMatrix(group.competencies, respondents)}
    `).join("")}
  </div>

  <div class="vr-section">
    <div class="vr-section-title">Топ-5 компетенций</div>
    <div class="vr-top5-section">
      ${renderTop5("Зоны для развития", data.top5Development, "dev")}
      ${renderTop5("Сильные стороны", data.top5Strength, "str")}
    </div>
  </div>

  <div class="vr-section">
    <div class="vr-section-title">Общие рекомендации</div>
    ${data.openQuestionAnswers.length === 0
      ? '<div class="vr-no-data">Ответы на открытые вопросы не получены.</div>'
      : data.openQuestionAnswers.map((entry) => `
        <div class="vr-reco-respondent">
          <div class="vr-reco-name">${esc(entry.respondentName)} <span style="font-weight:400;color:#64748b">(${esc(ROLE_LABELS[entry.role])})</span></div>
          ${entry.answers.map((answer, qi) => {
            const q = OPEN_QUESTIONS[qi];
            return `<div class="vr-reco-qa">
              <div class="vr-reco-question">${esc(q ? q.heading.toUpperCase() : `ВОПРОС ${qi + 1}`)}</div>
              <div class="vr-reco-answer">«${esc(answer)}»</div>
            </div>`;
          }).join("")}
        </div>
      `).join("")}
  </div>
  `}

</div>
</body>
</html>`;
}

function renderCompetencyBar(comp: VisualCompetencyData): string {
  const total = comp.totalDevelopment + comp.totalStrength;
  const devPct = total === 0 ? 0 : Math.round((comp.totalDevelopment / total) * 100);
  const strPct = total === 0 ? 0 : Math.round((comp.totalStrength / total) * 100);
  const dotLeft = total === 0 ? 50 : Math.round((comp.totalDevelopment / total) * 100);

  return `<div class="vr-comp-row">
    <div class="vr-comp-name">${esc(comp.name)}</div>
    <div class="vr-bar-wrap">
      <span class="vr-bar-label">${comp.totalDevelopment > 0 ? comp.totalDevelopment : ""}</span>
      <div class="vr-bar-track">
        <div class="vr-bar-dev" style="width:${devPct}%"></div>
        <div class="vr-bar-str" style="width:${strPct}%"></div>
        <div class="vr-bar-dot" style="left:${dotLeft}%"></div>
      </div>
      <span class="vr-bar-label right">${comp.totalStrength > 0 ? comp.totalStrength : ""}</span>
    </div>
  </div>`;
}

function renderGroupMatrix(
  competencies: VisualCompetencyData[],
  respondents: { role: string; status: string }[],
): string {
  const roleCounts = ALL_ROLES.reduce(
    (acc, role) => {
      acc[role] = respondents.filter((r) => r.role === role).length;
      return acc;
    },
    {} as Record<RespondentRole, number>,
  );

  return `<table class="vr-matrix">
    <thead>
      <tr>
        <th>Компетенция</th>
        ${ALL_ROLES.map((role) => `<th>${esc(ROLE_LABELS[role])}<br><span style="font-weight:400;font-size:10px">${roleCounts[role]} чел.</span></th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${competencies.map((comp) => `<tr>
        <td>${esc(comp.name)}</td>
        ${ALL_ROLES.map((role) => {
          const { development, strength, respondentCount } = comp.byRole[role];
          if (respondentCount === 0) return `<td><span class="vr-dash">—</span></td>`;
          const hasDev = development > 0;
          const hasStr = strength > 0;
          if (!hasDev && !hasStr) return `<td><span class="vr-dash">—</span></td>`;
          return `<td>${hasDev ? `<span class="vr-badge-dev">${development}</span>` : ""}${hasDev && hasStr ? " " : ""}${hasStr ? `<span class="vr-badge-str">${strength}</span>` : ""}</td>`;
        }).join("")}
      </tr>`).join("")}
    </tbody>
  </table>`;
}

function renderTop5(title: string, items: { name: string; count: number }[], type: "dev" | "str"): string {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;
  return `<div>
    <div class="vr-top5-title ${type}">${esc(title)}</div>
    ${items.length === 0 ? '<div class="vr-no-data">Нет данных</div>' : ""}
    ${items.map((item) => `<div class="vr-top5-row">
      <div class="vr-top5-name">${esc(item.name)}</div>
      <div class="vr-top5-count">${item.count}</div>
      <div class="vr-top5-bar ${type}" style="width:${Math.round((item.count / max) * 160)}px"></div>
    </div>`).join("")}
  </div>`;
}
