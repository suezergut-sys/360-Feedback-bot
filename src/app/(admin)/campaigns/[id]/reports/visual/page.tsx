import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { buildVisualReportData, type VisualCompetencyData, type RespondentRole } from "@/modules/reports/assembly";
import { OPEN_QUESTIONS } from "@/modules/interviews/state";
import { PrintButton } from "./PrintButton";

const ROLE_LABELS: Record<RespondentRole, string> = {
  self: "Самооценка",
  manager: "Руководитель",
  colleague: "Коллеги",
  client: "Клиенты",
};

const ALL_ROLES: RespondentRole[] = ["self", "manager", "colleague", "client"];

export default async function VisualReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminSession();
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerAdminId: admin.id },
    select: {
      id: true,
      title: true,
      subjectName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!campaign) notFound();

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
    // All respondent text messages — ratings go to CompetencyRating, so these are open Q answers
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

  // Group open messages by respondentId (in order = question index).
  // Ratings are button presses stored in CompetencyRating, not Message —
  // so all respondent messages here are open question answers.
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

  const expertsByRole = ALL_ROLES.reduce(
    (acc, role) => {
      acc[role] = data.experts.filter((e) => e.role === role);
      return acc;
    },
    {} as Record<RespondentRole, typeof data.experts>,
  );

  const hasData = ratings.length > 0;

  return (
    <>
      <style>{`
        .vr-page {
          font-family: Arial, sans-serif;
          font-size: 13px;
          color: #1a1a1a;
          background: #fff;
          max-width: 960px;
          margin: 0 auto;
          padding: 32px 24px;
        }
        .vr-no-print {
          background: #1e293b;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .vr-no-print a, .vr-no-print button {
          color: #94a3b8;
          text-decoration: none;
          font-size: 13px;
          background: none;
          border: 1px solid #334155;
          padding: 6px 14px;
          border-radius: 4px;
          cursor: pointer;
        }
        .vr-no-print button { color: #e2e8f0; border-color: #475569; background: #334155; }
        .vr-cover {
          min-height: 320px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 48px 0 32px;
          border-bottom: 2px solid #e2e8f0;
          margin-bottom: 32px;
        }
        .vr-cover-title { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .vr-cover-name { font-size: 28px; font-weight: 700; margin-bottom: 20px; }
        .vr-cover-meta { display: grid; gap: 6px; font-size: 13px; }
        .vr-cover-meta-row { display: flex; gap: 16px; justify-content: center; }
        .vr-cover-meta strong { font-weight: 600; }
        .vr-section { margin-bottom: 40px; }
        .vr-section-title {
          font-size: 15px;
          font-weight: 700;
          background: #f1f5f9;
          padding: 8px 12px;
          margin-bottom: 16px;
          border-left: 4px solid #3b82f6;
        }
        .vr-group-title {
          font-size: 13px;
          font-weight: 700;
          background: #e2e8f0;
          padding: 6px 12px;
          margin: 16px 0 8px;
        }
        .vr-experts-group { margin-bottom: 16px; }
        .vr-experts-group-header { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
        .vr-experts-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .vr-experts-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
        .vr-experts-table td:first-child { font-weight: 600; width: 220px; }
        .vr-empty { color: #94a3b8; font-size: 12px; padding: 8px 0; font-style: italic; }

        /* Competency bars */
        .vr-comp-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; gap: 12px; }
        .vr-comp-name { width: 260px; flex-shrink: 0; font-size: 12px; font-weight: 500; }
        .vr-bar-wrap { flex: 1; display: flex; align-items: center; gap: 10px; }
        .vr-bar-label { font-size: 11px; color: #64748b; width: 24px; text-align: right; flex-shrink: 0; }
        .vr-bar-label.right { text-align: left; }
        .vr-bar-track {
          flex: 1;
          height: 12px;
          background: #f1f5f9;
          border-radius: 6px;
          position: relative;
          display: flex;
          overflow: hidden;
        }
        .vr-bar-dev { background: #f97316; height: 100%; transition: width 0.3s; }
        .vr-bar-str { background: #22c55e; height: 100%; margin-left: auto; transition: width 0.3s; }
        .vr-bar-dot {
          position: absolute;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #fff;
          border: 2px solid #64748b;
          z-index: 2;
        }

        /* Group assessment table */
        .vr-matrix { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
        .vr-matrix th, .vr-matrix td { padding: 6px 10px; border: 1px solid #e2e8f0; text-align: center; }
        .vr-matrix th { background: #f8fafc; font-weight: 600; }
        .vr-matrix td:first-child { text-align: left; font-weight: 500; width: 240px; }
        .vr-matrix .role-header { font-weight: 700; }
        .vr-badge-dev {
          display: inline-flex; align-items: center; justify-content: center;
          background: #fff3e0; color: #ea580c; border: 1px solid #fed7aa;
          border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 700; min-width: 22px;
        }
        .vr-badge-str {
          display: inline-flex; align-items: center; justify-content: center;
          background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0;
          border-radius: 4px; padding: 1px 6px; font-size: 11px; font-weight: 700; min-width: 22px;
        }
        .vr-dash { color: #cbd5e1; }

        /* Top-5 charts */
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

        /* Open questions / recommendations */
        .vr-reco-respondent { margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
        .vr-reco-name { font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #1e293b; }
        .vr-reco-qa { margin-bottom: 8px; }
        .vr-reco-question { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: #64748b; margin-bottom: 3px; }
        .vr-reco-answer { font-size: 12px; color: #334155; padding: 4px 0 4px 12px; border-left: 2px solid #3b82f6; font-style: italic; }
        .vr-no-data { color: #94a3b8; font-size: 12px; font-style: italic; }

        @media print {
          .vr-no-print { display: none !important; }
          .vr-page { padding: 0; }
          .vr-cover { page-break-after: always; }
        }
      `}</style>

      {/* Sticky admin bar */}
      <div className="vr-no-print">
        <Link href={`/campaigns/${id}/reports`}>← Назад к отчётам</Link>
        <PrintButton campaignId={id} />
        <span style={{ color: "#64748b", fontSize: "12px" }}>
          {completedRespondents} из {totalRespondents} экспертов завершили интервью
        </span>
      </div>

      <div className="vr-page">

        {/* ── Section A: Cover ─────────────────────────────────────────────── */}
        <div className="vr-cover">
          <div className="vr-cover-title">Отчёт по результатам</div>
          <div className="vr-cover-name">{campaign.subjectName}</div>
          <div className="vr-cover-meta">
            <div className="vr-cover-meta-row">
              <span><strong>Наименование опроса:</strong> {campaign.title}</span>
            </div>
            <div className="vr-cover-meta-row">
              <span>
                <strong>Дата формирования:</strong>{" "}
                {campaign.updatedAt.toLocaleDateString("ru-RU")}
              </span>
            </div>
            <div className="vr-cover-meta-row">
              <span>
                <strong>Экспертов завершили:</strong> {completedRespondents} из {totalRespondents}
              </span>
            </div>
          </div>
        </div>

        {/* ── Section B: Experts ───────────────────────────────────────────── */}
        <div className="vr-section">
          <div className="vr-section-title">Эксперты</div>
          {ALL_ROLES.map((role) => {
            const group = expertsByRole[role];
            if (group.length === 0) return null;
            const completed = group.filter((e) => e.status === "completed").length;
            return (
              <div key={role} className="vr-experts-group">
                <div className="vr-experts-group-header">
                  {ROLE_LABELS[role]} (оценили {completed} из {group.length})
                </div>
                <table className="vr-experts-table">
                  <tbody>
                    {group.map((expert, i) => (
                      <tr key={i}>
                        <td>{expert.displayName}</td>
                        <td>{expert.department ?? "—"}</td>
                        <td>{expert.position ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {data.experts.length === 0 && <div className="vr-empty">Респонденты не добавлены.</div>}
        </div>

        {!hasData && (
          <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: "8px", marginBottom: "32px" }}>
            Данные обратной связи ещё не получены. Дождитесь завершения интервью.
          </div>
        )}

        {hasData && (
          <>
            {/* ── Section C: Feedback result bars ─────────────────────────── */}
            <div className="vr-section">
              <div className="vr-section-title">Результаты обратной связи</div>
              <div style={{ display: "flex", gap: "24px", marginBottom: "12px", fontSize: "11px", color: "#64748b" }}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, background: "#f97316", borderRadius: 2, marginRight: 4 }} />
                  Зона для развития (оценка 1–2)
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, background: "#22c55e", borderRadius: 2, marginRight: 4 }} />
                  Сильная сторона (оценка 4–5)
                </span>
              </div>
              {data.competencyGroups.map((group) => (
                <div key={group.groupName}>
                  <div className="vr-group-title">{group.groupName}</div>
                  {group.competencies.map((comp) => (
                    <CompetencyBar key={comp.id} comp={comp} />
                  ))}
                </div>
              ))}
            </div>

            {/* ── Section D: Group assessment table ───────────────────────── */}
            <div className="vr-section">
              <div className="vr-section-title">Оценка по группам</div>
              <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "8px", display: "flex", gap: 16 }}>
                <span><span className="vr-badge-dev">1</span> — зона для развития</span>
                <span><span className="vr-badge-str">1</span> — сильная сторона</span>
                <span><span className="vr-dash">—</span> — не выбрано</span>
              </div>
              {data.competencyGroups.map((group) => (
                <div key={group.groupName}>
                  <div className="vr-group-title">{group.groupName}</div>
                  <GroupMatrix competencies={group.competencies} respondents={respondents} />
                </div>
              ))}
            </div>

            {/* ── Section E: Top-5 charts ──────────────────────────────────── */}
            <div className="vr-section">
              <div className="vr-section-title">Топ-5 компетенций</div>
              <div className="vr-top5-section">
                <Top5Chart title="Зоны для развития" items={data.top5Development} type="dev" />
                <Top5Chart title="Сильные стороны" items={data.top5Strength} type="str" />
              </div>
            </div>

            {/* ── Section F: Open question recommendations ─────────────────── */}
            <div className="vr-section">
              <div className="vr-section-title">Общие рекомендации</div>
              {data.openQuestionAnswers.length === 0 && (
                <div className="vr-no-data">Ответы на открытые вопросы не получены.</div>
              )}
              {data.openQuestionAnswers.map((entry, i) => (
                <div key={i} className="vr-reco-respondent">
                  <div className="vr-reco-name">
                    {entry.respondentName}{" "}
                    <span style={{ fontWeight: 400, color: "#64748b" }}>({ROLE_LABELS[entry.role]})</span>
                  </div>
                  {entry.answers.map((answer, qi) => {
                    const q = OPEN_QUESTIONS[qi];
                    return (
                      <div key={qi} className="vr-reco-qa">
                        <div className="vr-reco-question">{q ? q.heading.toUpperCase() : `ВОПРОС ${qi + 1}`}</div>
                        <div className="vr-reco-answer">«{answer}»</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CompetencyBar({ comp }: { comp: VisualCompetencyData }) {
  const total = comp.totalDevelopment + comp.totalStrength;
  const devPct = total === 0 ? 0 : Math.round((comp.totalDevelopment / total) * 100);
  const strPct = total === 0 ? 0 : Math.round((comp.totalStrength / total) * 100);
  const dotLeft = total === 0 ? 50 : Math.round((comp.totalDevelopment / total) * 100);

  return (
    <div className="vr-comp-row">
      <div className="vr-comp-name">{comp.name}</div>
      <div className="vr-bar-wrap">
        <span className="vr-bar-label">{comp.totalDevelopment > 0 ? comp.totalDevelopment : ""}</span>
        <div className="vr-bar-track">
          <div className="vr-bar-dev" style={{ width: `${devPct}%` }} />
          <div className="vr-bar-str" style={{ width: `${strPct}%` }} />
          <div className="vr-bar-dot" style={{ left: `${dotLeft}%` }} />
        </div>
        <span className="vr-bar-label right">{comp.totalStrength > 0 ? comp.totalStrength : ""}</span>
      </div>
    </div>
  );
}

function GroupMatrix({
  competencies,
  respondents,
}: {
  competencies: VisualCompetencyData[];
  respondents: { role: string; status: string }[];
}) {
  const roleCounts = ALL_ROLES.reduce(
    (acc, role) => {
      acc[role] = respondents.filter((r) => r.role === role).length;
      return acc;
    },
    {} as Record<RespondentRole, number>,
  );

  return (
    <table className="vr-matrix">
      <thead>
        <tr>
          <th>Компетенция</th>
          {ALL_ROLES.map((role) => (
            <th key={role} className="role-header">
              {ROLE_LABELS[role]}
              <br />
              <span style={{ fontWeight: 400, fontSize: "10px" }}>{roleCounts[role]} чел.</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {competencies.map((comp) => (
          <tr key={comp.id}>
            <td>{comp.name}</td>
            {ALL_ROLES.map((role) => {
              const { development, strength, respondentCount } = comp.byRole[role];
              if (respondentCount === 0) {
                return <td key={role}><span className="vr-dash">—</span></td>;
              }
              const hasDev = development > 0;
              const hasStr = strength > 0;
              if (!hasDev && !hasStr) {
                return <td key={role}><span className="vr-dash">—</span></td>;
              }
              return (
                <td key={role}>
                  {hasDev && <span className="vr-badge-dev">{development}</span>}
                  {hasDev && hasStr && " "}
                  {hasStr && <span className="vr-badge-str">{strength}</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Top5Chart({ title, items, type }: { title: string; items: { name: string; count: number }[]; type: "dev" | "str" }) {
  const max = items.length > 0 ? Math.max(...items.map((i) => i.count)) : 1;
  return (
    <div>
      <div className={`vr-top5-title ${type}`}>{title}</div>
      {items.length === 0 && <div className="vr-no-data">Нет данных</div>}
      {items.map((item, i) => (
        <div key={i} className="vr-top5-row">
          <div className="vr-top5-name">{item.name}</div>
          <div className="vr-top5-count">{item.count}</div>
          <div
            className={`vr-top5-bar ${type}`}
            style={{ width: `${Math.round((item.count / max) * 160)}px` }}
          />
        </div>
      ))}
    </div>
  );
}
