import { notFound } from "next/navigation";
import { CampaignTabs } from "@/components/campaign-tabs";
import { requireAdminSession } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/prisma";
import { OPEN_QUESTIONS } from "@/modules/interviews/state";

const RATING_LABELS: Record<number, string> = {
  1: "1 — Никогда",
  2: "2 — Редко",
  3: "3 — Иногда",
  4: "4 — Часто",
  5: "5 — Всегда",
};

export default async function CampaignResponsesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminSession();
  const { id } = await params;

  const campaign = await prisma.campaign.findFirst({
    where: { id, ownerAdminId: admin.id },
    select: { id: true, title: true },
  });

  if (!campaign) notFound();

  const [respondents, allRatings] = await Promise.all([
    prisma.respondent.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        displayName: true,
        role: true,
        position: true,
        department: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.competencyRating.findMany({
      where: { campaignId: id },
      select: {
        respondentId: true,
        competencyId: true,
        rating: true,
        competency: { select: { name: true, priorityOrder: true } },
      },
      orderBy: { competency: { priorityOrder: "asc" } },
    }),
  ]);

  // Load sessions with messages for each respondent
  const sessions = await prisma.interviewSession.findMany({
    where: { campaignId: id },
    select: {
      respondentId: true,
      messages: {
        where: { senderType: { in: ["assistant", "respondent"] } },
        select: {
          id: true,
          senderType: true,
          messageType: true,
          rawText: true,
          transcriptText: true,
          competencyId: true,
          createdAt: true,
          competency: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const sessionByRespondent = new Map(sessions.map((s) => [s.respondentId, s.messages]));
  const ratingsByRespondent = new Map<string, typeof allRatings>();
  for (const r of allRatings) {
    if (!ratingsByRespondent.has(r.respondentId)) ratingsByRespondent.set(r.respondentId, []);
    ratingsByRespondent.get(r.respondentId)!.push(r);
  }

  const ROLE_LABELS: Record<string, string> = {
    self: "Самооценка",
    manager: "Руководитель",
    colleague: "Коллеги",
    client: "Клиенты",
  };

  return (
    <section className="stack-lg">
      <h2>Ответы: {campaign.title}</h2>
      <CampaignTabs campaignId={campaign.id} />

      {respondents.length === 0 && (
        <div className="card" style={{ color: "#64748b", textAlign: "center", padding: "32px" }}>
          Респонденты не добавлены.
        </div>
      )}

      {respondents.map((respondent) => {
        const messages = sessionByRespondent.get(respondent.id) ?? [];
        const ratings = ratingsByRespondent.get(respondent.id) ?? [];

        // Split messages into conversation pairs (bot question → user answer)
        const conversationPairs: { question: string | null; answer: string | null; competency: string | null }[] = [];
        let i = 0;
        while (i < messages.length) {
          const msg = messages[i];
          if (msg.senderType === "assistant") {
            const next = messages[i + 1];
            if (next?.senderType === "respondent") {
              conversationPairs.push({
                question: msg.transcriptText ?? msg.rawText ?? null,
                answer: next.transcriptText ?? next.rawText ?? null,
                competency: msg.competency?.name ?? next.competency?.name ?? null,
              });
              i += 2;
            } else {
              conversationPairs.push({
                question: msg.transcriptText ?? msg.rawText ?? null,
                answer: null,
                competency: msg.competency?.name ?? null,
              });
              i += 1;
            }
          } else {
            conversationPairs.push({
              question: null,
              answer: msg.transcriptText ?? msg.rawText ?? null,
              competency: msg.competency?.name ?? null,
            });
            i += 1;
          }
        }

        return (
          <div key={respondent.id} className="card">
            <div style={{ marginBottom: "16px", paddingBottom: "12px", borderBottom: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "15px" }}>{respondent.displayName ?? "Без имени"}</strong>
              <span style={{ marginLeft: "10px", fontSize: "12px", color: "#64748b" }}>
                {ROLE_LABELS[respondent.role] ?? respondent.role}
                {respondent.department ? ` · ${respondent.department}` : ""}
                {respondent.position ? ` · ${respondent.position}` : ""}
              </span>
              <span style={{
                marginLeft: "10px",
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: respondent.status === "completed" ? "#f0fdf4" : "#f8fafc",
                color: respondent.status === "completed" ? "#16a34a" : "#64748b",
                border: `1px solid ${respondent.status === "completed" ? "#bbf7d0" : "#e2e8f0"}`,
              }}>
                {respondent.status === "completed" ? "Завершил" : respondent.status === "started" ? "В процессе" : "Приглашён"}
              </span>
            </div>

            {/* Ratings table */}
            {ratings.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Оценки по компетенциям
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "5px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontWeight: 600 }}>Компетенция</th>
                      <th style={{ textAlign: "center", padding: "5px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", fontWeight: 600, width: 160 }}>Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratings.map((r) => (
                      <tr key={r.competencyId}>
                        <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0" }}>{r.competency.name}</td>
                        <td style={{ padding: "5px 8px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                          {r.rating === null
                            ? <span style={{ color: "#94a3b8" }}>N/A</span>
                            : <span style={{
                                fontWeight: 700,
                                color: r.rating >= 4 ? "#16a34a" : r.rating <= 2 ? "#ea580c" : "#64748b",
                              }}>
                                {RATING_LABELS[r.rating] ?? r.rating}
                              </span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Open question answers */}
            {(() => {
              const openAnswers = messages
                .filter((m) => m.senderType === "respondent")
                .map((m) => m.transcriptText ?? m.rawText ?? "")
                .filter(Boolean);

              if (openAnswers.length === 0) return null;

              return (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Открытые вопросы
                  </div>
                  {openAnswers.map((answer, qi) => {
                    const q = OPEN_QUESTIONS[qi];
                    return (
                      <div key={qi} style={{ marginBottom: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div style={{ fontSize: "12px", color: "#475569", padding: "8px 12px", background: "#f8fafc", borderRadius: "6px", borderLeft: "3px solid #94a3b8" }}>
                          <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "11px", color: "#64748b" }}>
                            Бот — {q ? q.heading : `Вопрос ${qi + 1}`}
                          </div>
                          {q ? q.text : ""}
                        </div>
                        <div style={{ fontSize: "12px", color: "#1e293b", padding: "8px 12px", background: "#fff", borderRadius: "6px", borderLeft: "3px solid #3b82f6", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "11px", color: "#64748b" }}>
                            Ответ
                          </div>
                          {answer}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {ratings.length === 0 && messages.length === 0 && (
              <div style={{ color: "#94a3b8", fontSize: "12px", fontStyle: "italic" }}>
                Ответов пока нет.
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
