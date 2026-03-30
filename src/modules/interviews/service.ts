import {
  CampaignStatus,
  MessageType,
  RespondentStatus,
  SenderType,
  type Campaign,
  type Competency,
  type Prisma,
  type Respondent,
} from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logging/logger";
import { buildInterviewSystemPrompt } from "@/prompts/interview";
import { generateInterviewDecision } from "@/lib/openai/service";
import {
  buildFallbackQuestion,
  createInitialInterviewState,
  getCurrentStep,
  looksLikeConsent,
  moveToNextCompetency,
  moveToNextMethodologyStep,
  parseInterviewState,
  withInterviewCompleted,
  withInterviewStarted,
  type InterviewState,
} from "@/modules/interviews/state";
import { enqueueJob } from "@/lib/jobs/queue";
import { isInviteTokenFormatValid, normalizeInviteToken } from "@/modules/respondents/token";
import { sanitizeUserInputForPrompt } from "@/lib/security/prompt-safety";

const HELP_TEXT = [
  "Доступные команды:",
  "/start <token> - начать интервью по приглашению",
  "/resume - продолжить с последнего шага",
  "/finish - завершить интервью",
  "/help - показать справку",
].join("\n");

const INVITE_REQUIRED_TEXT =
  "Для доступа к интервью нужен персональный инвайт. Откройте ссылку, которую вам отправил администратор.";

type ActiveCampaignContext = {
  campaign: Campaign;
  respondent: Respondent;
  competencies: Competency[];
};

export type InboundMessage = {
  chatId: number;
  telegramUserId: bigint;
  telegramUsername?: string;
  telegramMessageId: number;
  text?: string;
  messageType: MessageType;
  transcriptText?: string;
  metadata?: Record<string, unknown>;
};

async function getEnabledCompetencies(campaignId: string): Promise<Competency[]> {
  return prisma.competency.findMany({
    where: { campaignId, enabled: true },
    orderBy: { priorityOrder: "asc" },
  });
}

async function loadContextByToken(token: string): Promise<ActiveCampaignContext | null> {
  const respondent = await prisma.respondent.findUnique({
    where: { inviteToken: token },
    include: {
      campaign: true,
    },
  });

  if (!respondent) {
    return null;
  }

  if (respondent.campaign.status !== CampaignStatus.active && respondent.campaign.status !== CampaignStatus.paused) {
    return null;
  }

  const competencies = await getEnabledCompetencies(respondent.campaignId);

  return {
    campaign: respondent.campaign,
    respondent,
    competencies,
  };
}

async function loadContextByTelegramUser(telegramUserId: bigint): Promise<ActiveCampaignContext | null> {
  const respondent = await prisma.respondent.findFirst({
    where: { telegramUserId },
    include: {
      campaign: true,
    },
  });

  if (!respondent) {
    return null;
  }

  const competencies = await getEnabledCompetencies(respondent.campaignId);

  return {
    campaign: respondent.campaign,
    respondent,
    competencies,
  };
}

async function ensureSession(context: ActiveCampaignContext) {
  const firstCompetency = context.competencies[0];

  return prisma.interviewSession.upsert({
    where: {
      campaignId_respondentId: {
        campaignId: context.campaign.id,
        respondentId: context.respondent.id,
      },
    },
    update: {
      lastActivityAt: new Date(),
    },
    create: {
      campaignId: context.campaign.id,
      respondentId: context.respondent.id,
      currentState: createInitialInterviewState(),
      currentCompetencyId: firstCompetency?.id,
    },
  });
}

async function saveMessage(params: {
  sessionId: string;
  competencyId?: string | null;
  senderType: SenderType;
  telegramMessageId?: number;
  messageType: MessageType;
  rawText?: string;
  transcriptText?: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.message.create({
    data: {
      sessionId: params.sessionId,
      competencyId: params.competencyId,
      senderType: params.senderType,
      telegramMessageId: params.telegramMessageId,
      messageType: params.messageType,
      rawText: params.rawText,
      transcriptText: params.transcriptText,
      normalizedText: params.transcriptText?.trim().toLowerCase() ?? params.rawText?.trim().toLowerCase(),
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

async function setSessionState(params: {
  sessionId: string;
  state: InterviewState;
  currentCompetencyId?: string | null;
  completed?: boolean;
}) {
  return prisma.interviewSession.update({
    where: { id: params.sessionId },
    data: {
      currentState: params.state,
      currentCompetencyId: params.currentCompetencyId,
      lastActivityAt: new Date(),
      completedAt: params.completed ? new Date() : undefined,
    },
  });
}

async function getSessionHistory(sessionId: string) {
  const messages = await prisma.message.findMany({
    where: {
      sessionId,
      senderType: { in: ["assistant", "respondent"] },
    },
    orderBy: { createdAt: "asc" },
    take: 30,
  });

  return messages.map((message) => ({
    sender: message.senderType,
    text: sanitizeUserInputForPrompt(message.transcriptText ?? message.rawText ?? ""),
  })) as Array<{ sender: "respondent" | "assistant"; text: string }>;
}

function getCurrentCompetency(state: InterviewState, competencies: Competency[]): Competency | null {
  return competencies[state.competencyIndex] ?? null;
}

async function finalizeInterview(context: ActiveCampaignContext, sessionId: string, state: InterviewState) {
  const completedState = withInterviewCompleted(state);

  await setSessionState({
    sessionId,
    state: completedState,
    currentCompetencyId: null,
    completed: true,
  });

  await prisma.respondent.update({
    where: { id: context.respondent.id },
    data: { status: RespondentStatus.completed },
  });

  await enqueueJob("extract_feedback", {
    campaignId: context.campaign.id,
    respondentId: context.respondent.id,
  });

  await enqueueJob("generate_reports", {
    campaignId: context.campaign.id,
  });

  return context.campaign.closingMessage;
}

async function buildAndStoreAssistantQuestion(params: {
  sessionId: string;
  competencyId?: string | null;
  telegramChatId: number;
  text: string;
}) {
  await saveMessage({
    sessionId: params.sessionId,
    competencyId: params.competencyId,
    senderType: SenderType.assistant,
    messageType: MessageType.text,
    rawText: params.text,
    transcriptText: params.text,
    metadata: { chatId: params.telegramChatId },
  });
}

async function askNextQuestion(params: {
  context: ActiveCampaignContext;
  sessionId: string;
  state: InterviewState;
  telegramChatId: number;
}): Promise<string> {
  const currentCompetency = getCurrentCompetency(params.state, params.context.competencies);

  if (!currentCompetency) {
    return finalizeInterview(params.context, params.sessionId, params.state);
  }

  const step = getCurrentStep(params.state);
  const history = await getSessionHistory(params.sessionId);

  const systemPrompt = buildInterviewSystemPrompt({
    campaignTitle: params.context.campaign.title,
    subjectName: params.context.campaign.subjectName,
    competency: currentCompetency,
    step,
  });

  const decision = await generateInterviewDecision({
    systemPrompt,
    history,
  });

  let nextState = params.state;

  if (decision.finish_interview) {
    return finalizeInterview(params.context, params.sessionId, nextState);
  }

  if (decision.move_next_competency) {
    nextState = moveToNextCompetency(nextState);
  } else if (decision.advance_step) {
    nextState = moveToNextMethodologyStep(nextState);
  }

  const nextCompetency = getCurrentCompetency(nextState, params.context.competencies);

  if (!nextCompetency) {
    return finalizeInterview(params.context, params.sessionId, nextState);
  }

  const nextStep = getCurrentStep(nextState);
  const question = decision.next_question?.trim() || buildFallbackQuestion(nextCompetency.name, nextStep);

  const storedState: InterviewState = {
    ...nextState,
    phase: "interview",
    lastQuestion: question,
  };

  await setSessionState({
    sessionId: params.sessionId,
    state: storedState,
    currentCompetencyId: nextCompetency.id,
  });

  await buildAndStoreAssistantQuestion({
    sessionId: params.sessionId,
    competencyId: nextCompetency.id,
    telegramChatId: params.telegramChatId,
    text: question,
  });

  return question;
}

export async function handleStartCommand(params: {
  inviteToken: string | null;
  telegramUserId: bigint;
  telegramUsername?: string;
  chatId: number;
}): Promise<string> {
  const inviteToken = normalizeInviteToken(params.inviteToken);

  if (!inviteToken || !isInviteTokenFormatValid(inviteToken)) {
    return INVITE_REQUIRED_TEXT;
  }

  const context = await loadContextByToken(inviteToken);

  if (!context) {
    return INVITE_REQUIRED_TEXT;
  }

  if (context.respondent.telegramUserId && context.respondent.telegramUserId !== params.telegramUserId) {
    return "Этот инвайт уже привязан к другому аккаунту Telegram. Обратитесь к администратору.";
  }

  if (!context.respondent.telegramUserId) {
    await prisma.respondent.update({
      where: { id: context.respondent.id },
      data: {
        telegramUserId: params.telegramUserId,
        telegramUsername: params.telegramUsername,
        status: RespondentStatus.started,
      },
    });
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "completed" || session.completedAt) {
    return "Интервью уже завершено. Спасибо за участие.";
  }

  const consentMessage = [
    context.campaign.welcomeMessage,
    "",
    "Интервью проводит ИИ-ассистент. Мы сохраним только текст ваших ответов, включая расшифровку голосовых сообщений.",
    "Если вы согласны продолжить, ответьте: Да.",
  ].join("\n");

  await saveMessage({
    sessionId: session.id,
    competencyId: session.currentCompetencyId,
    senderType: SenderType.system,
    messageType: MessageType.system,
      rawText: "Session started by /start command",
      metadata: { chatId: params.chatId, inviteToken },
  });

  await buildAndStoreAssistantQuestion({
    sessionId: session.id,
    competencyId: session.currentCompetencyId,
    telegramChatId: params.chatId,
    text: consentMessage,
  });

  return consentMessage;
}

export async function handleResumeCommand(telegramUserId: bigint, chatId: number): Promise<string> {
  const context = await loadContextByTelegramUser(telegramUserId);

  if (!context) {
    return INVITE_REQUIRED_TEXT;
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "consent") {
    return "Чтобы начать интервью, подтвердите согласие сообщением: Да.";
  }

  if (state.phase === "completed") {
    return "Интервью уже завершено. Спасибо за участие.";
  }

  const competency = getCurrentCompetency(state, context.competencies);
  const step = getCurrentStep(state);
  const fallbackQuestion = competency ? buildFallbackQuestion(competency.name, step) : "Продолжим интервью.";
  const resumeQuestion = state.lastQuestion ?? fallbackQuestion;

  await buildAndStoreAssistantQuestion({
    sessionId: session.id,
    competencyId: competency?.id,
    telegramChatId: chatId,
    text: resumeQuestion,
  });

  return resumeQuestion;
}

export async function handleFinishCommand(telegramUserId: bigint): Promise<string> {
  const context = await loadContextByTelegramUser(telegramUserId);

  if (!context) {
    return INVITE_REQUIRED_TEXT;
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "completed") {
    return "Интервью уже завершено.";
  }

  return finalizeInterview(context, session.id, state);
}

export async function handleHelpCommand(): Promise<string> {
  return HELP_TEXT;
}

export async function handleRespondentMessage(input: InboundMessage): Promise<string> {
  const context = await loadContextByTelegramUser(input.telegramUserId);

  if (!context) {
    return INVITE_REQUIRED_TEXT;
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);
  const competency = getCurrentCompetency(state, context.competencies);
  const text = (input.transcriptText ?? input.text ?? "").trim();

  if (!text) {
    return "Не удалось прочитать сообщение. Попробуйте отправить текст еще раз.";
  }

  await saveMessage({
    sessionId: session.id,
    competencyId: competency?.id,
    senderType: SenderType.respondent,
    telegramMessageId: input.telegramMessageId,
    messageType: input.messageType,
    rawText: input.text,
    transcriptText: input.transcriptText ?? input.text,
    metadata: {
      chatId: input.chatId,
      telegramUserId: input.telegramUserId.toString(),
      ...input.metadata,
    },
  });

  if (state.phase === "consent") {
    if (!looksLikeConsent(text)) {
      const consentReminder = "Чтобы продолжить интервью, подтвердите согласие сообщением: Да.";

      await buildAndStoreAssistantQuestion({
        sessionId: session.id,
        competencyId: competency?.id,
        telegramChatId: input.chatId,
        text: consentReminder,
      });

      return consentReminder;
    }

    const startedState = withInterviewStarted(state);
    const firstCompetency = getCurrentCompetency(startedState, context.competencies);

    if (!firstCompetency) {
      return finalizeInterview(context, session.id, startedState);
    }

    const firstQuestion = buildFallbackQuestion(firstCompetency.name, "opening");

    await setSessionState({
      sessionId: session.id,
      state: {
        ...startedState,
        lastQuestion: firstQuestion,
      },
      currentCompetencyId: firstCompetency.id,
    });

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: firstCompetency.id,
      telegramChatId: input.chatId,
      text: firstQuestion,
    });

    return firstQuestion;
  }

  if (state.phase === "completed") {
    return "Интервью уже завершено. Спасибо за участие.";
  }

  try {
    return await askNextQuestion({
      context,
      sessionId: session.id,
      state,
      telegramChatId: input.chatId,
    });
  } catch (error) {
    logger.error("Failed to generate next interview question", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });

    const fallback = "Спасибо. Зафиксировал ответ. Можете добавить еще один конкретный пример по этой компетенции?";

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: competency?.id,
      telegramChatId: input.chatId,
      text: fallback,
    });

    return fallback;
  }
}
