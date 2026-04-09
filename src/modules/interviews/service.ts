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
import { type InlineKeyboard } from "@/lib/telegram/client";
import {
  MAX_QUESTIONS_PER_MARKER,
  OPEN_QUESTIONS,
  buildFallbackQuestion,
  createInitialInterviewState,
  getCurrentStep,
  incrementMarkerQuestionCount,
  isRepeatedQuestion,
  looksLikeNoAnswer,
  looksLikeSkip,
  moveToNextCompetency,
  moveToNextMarker,
  moveToNextMethodologyStep,
  moveToNextOpenQuestion,
  moveToNextRating,
  parseInterviewState,
  withInterviewCompleted,
  withOpenQuestionsStarted,
  withRatingStarted,
  type InterviewState,
} from "@/modules/interviews/state";
import { enqueueJob } from "@/lib/jobs/queue";
import { isInviteTokenFormatValid, normalizeInviteToken } from "@/modules/respondents/token";
import { sanitizeUserInputForPrompt } from "@/lib/security/prompt-safety";

// ── Reply type ─────────────────────────────────────────────────────────────

export type BotReply = {
  text: string;
  keyboard?: InlineKeyboard;
};

// ── Keyboards ──────────────────────────────────────────────────────────────

const CONSENT_KEYBOARD: InlineKeyboard = {
  inline_keyboard: [[{ text: "Начать", callback_data: "consent:start" }]],
};

const RATING_KEYBOARD: InlineKeyboard = {
  inline_keyboard: [
    [
      { text: "1", callback_data: "rating:1" },
      { text: "2", callback_data: "rating:2" },
      { text: "3", callback_data: "rating:3" },
      { text: "4", callback_data: "rating:4" },
      { text: "5", callback_data: "rating:5" },
    ],
    [{ text: "N/A — не наблюдал(а)", callback_data: "rating:na" }],
  ],
};

const RATING_SCALE_HINT = [
  "1 — Почти никогда",
  "2 — Редко",
  "3 — Иногда",
  "4 — Часто",
  "5 — Почти всегда",
  "N/A — Не было возможности наблюдать",
].join("\n");

// ── Constants ──────────────────────────────────────────────────────────────

const HELP_TEXT = [
  "Доступные команды:",
  "/start <token> - начать интервью по приглашению",
  "/resume - продолжить с последнего шага",
  "/finish - завершить интервью",
  "/help - показать справку",
].join("\n");

const INVITE_REQUIRED_TEXT =
  "Для доступа к интервью нужен персональный инвайт. Откройте ссылку, которую вам отправил администратор.";

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── Message builders ───────────────────────────────────────────────────────

function buildRatingMessage(competency: Competency, index: number, totalCompetencies: number, isFirst: boolean): string {
  const totalSteps = totalCompetencies + OPEN_QUESTIONS.length;
  const parts: string[] = [];

  if (isFirst) {
    parts.push(
      "Оцените, насколько данный руководитель демонстрирует описанное поведение в рабочем взаимодействии с вами.",
      "Опирайтесь на реальные наблюдения за последние 3–6 месяцев.",
      "",
      "Шкала оценки:",
      RATING_SCALE_HINT,
      "",
      "──────────────────────",
      "",
    );
  }

  parts.push(`Шаг: ${index + 1}/${totalSteps}`);
  parts.push("");
  parts.push(competency.name);

  if (competency.groupName) {
    parts.push(`Блок: ${competency.groupName}`);
  }

  parts.push("", competency.description, "", "Насколько часто проявляется данное поведение?");

  return parts.join("\n");
}

function buildOpenQuestionMessage(index: number, isTransition: boolean, totalCompetencies: number): string {
  const q = OPEN_QUESTIONS[index];

  if (!q) {
    return "";
  }

  const totalSteps = totalCompetencies + OPEN_QUESTIONS.length;
  const stepNumber = totalCompetencies + index + 1;
  const parts: string[] = [];

  if (isTransition) {
    parts.push(
      "Отлично, оценки выставлены!",
      "",
      "Теперь несколько открытых вопросов.",
      "",
      "──────────────────────",
      "",
    );
  }

  const optionalSuffix = q.optional ? " (необязательно)" : "";
  parts.push(`Шаг: ${stepNumber}/${totalSteps}${optionalSuffix}`, "", q.heading, "", q.text);

  return parts.join("\n");
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function getEnabledCompetencies(campaignId: string): Promise<Competency[]> {
  return prisma.competency.findMany({
    where: { campaignId, enabled: true },
    orderBy: { priorityOrder: "asc" },
  });
}

async function loadContextByToken(token: string): Promise<ActiveCampaignContext | null> {
  const respondent = await prisma.respondent.findUnique({
    where: { inviteToken: token },
    include: { campaign: true },
  });

  if (!respondent) {
    return null;
  }

  if (respondent.campaign.status !== CampaignStatus.active && respondent.campaign.status !== CampaignStatus.paused) {
    return null;
  }

  const competencies = await getEnabledCompetencies(respondent.campaignId);

  return { campaign: respondent.campaign, respondent, competencies };
}

async function loadContextByTelegramUser(telegramUserId: bigint): Promise<ActiveCampaignContext | null> {
  // Prefer the most recently active non-completed respondent in an active campaign.
  // Using findFirst without ordering can return wrong records when a user
  // has multiple respondent entries (different campaigns or test runs).
  const respondent = await prisma.respondent.findFirst({
    where: {
      telegramUserId,
      status: { not: RespondentStatus.completed },
      campaign: { status: { in: [CampaignStatus.active, CampaignStatus.paused] } },
    },
    include: { campaign: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!respondent) {
    // Fall back to the most recently updated completed respondent
    // (so the user still gets "already completed" feedback)
    const completed = await prisma.respondent.findFirst({
      where: { telegramUserId },
      include: { campaign: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!completed) return null;
    const competencies = await getEnabledCompetencies(completed.campaignId);
    return { campaign: completed.campaign, respondent: completed, competencies };
  }

  const competencies = await getEnabledCompetencies(respondent.campaignId);

  return { campaign: respondent.campaign, respondent, competencies };
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
    update: { lastActivityAt: new Date() },
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

async function finalizeInterview(context: ActiveCampaignContext, sessionId: string, state: InterviewState) {
  const completedState = withInterviewCompleted(state);

  await setSessionState({ sessionId, state: completedState, currentCompetencyId: null, completed: true });

  await prisma.respondent.update({
    where: { id: context.respondent.id },
    data: { status: RespondentStatus.completed },
  });

  await enqueueJob("extract_feedback", {
    campaignId: context.campaign.id,
    respondentId: context.respondent.id,
  });

  await enqueueJob("generate_reports", { campaignId: context.campaign.id });

  return context.campaign.closingMessage;
}

// ── Rating callback handler ────────────────────────────────────────────────

export async function handleRatingCallback(params: {
  telegramUserId: bigint;
  chatId: number;
  callbackData: string;
}): Promise<{ editText: string; reply: BotReply | null }> {
  const [prefix, valueStr] = params.callbackData.split(":");

  if (!prefix) {
    return { editText: "", reply: null };
  }

  const context = await loadContextByTelegramUser(params.telegramUserId);

  if (!context) {
    return { editText: "", reply: { text: INVITE_REQUIRED_TEXT } };
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  // ── Consent button ─────────────────────────────────────────────────────
  if (prefix === "consent" && valueStr === "start") {
    if (state.phase === "completed" || session.completedAt) {
      return { editText: "✅ Опрос уже завершён", reply: { text: "Интервью уже завершено. Спасибо за участие." } };
    }

    // Accept "Начать" regardless of current phase — user may be retrying from an old message
    const ratingState = withRatingStarted(createInitialInterviewState());
    const firstCompetency = context.competencies[0];

    if (!firstCompetency) {
      const closingMessage = await finalizeInterview(context, session.id, ratingState);
      return { editText: "✅ Опрос начат", reply: { text: closingMessage } };
    }

    await setSessionState({ sessionId: session.id, state: ratingState, currentCompetencyId: firstCompetency.id });

    const ratingMessage = buildRatingMessage(firstCompetency, 0, context.competencies.length, true);

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: firstCompetency.id,
      telegramChatId: params.chatId,
      text: ratingMessage,
    });

    logger.info("Consent given via button, starting rating phase", {
      sessionId: session.id,
      respondentId: context.respondent.id,
    });

    return { editText: "✅ Начинаем!", reply: { text: ratingMessage, keyboard: RATING_KEYBOARD } };
  }

  // ── Rating button ──────────────────────────────────────────────────────
  if (prefix !== "rating" || !valueStr) {
    return { editText: "", reply: null };
  }

  if (state.phase !== "rating") {
    return { editText: "", reply: null };
  }

  const currentCompetency = context.competencies[state.ratingIndex];

  if (!currentCompetency) {
    return { editText: "", reply: null };
  }

  const rating = valueStr === "na" ? null : parseInt(valueStr, 10);
  const ratingLabel = valueStr === "na" ? "N/A" : valueStr;

  await prisma.competencyRating.upsert({
    where: {
      respondentId_competencyId: {
        respondentId: context.respondent.id,
        competencyId: currentCompetency.id,
      },
    },
    create: {
      campaignId: context.campaign.id,
      respondentId: context.respondent.id,
      competencyId: currentCompetency.id,
      rating,
    },
    update: { rating },
  });

  const editText = "";
  const nextRatingIndex = state.ratingIndex + 1;

  if (nextRatingIndex >= context.competencies.length) {
    // All competencies rated — start open questions
    const newState = withOpenQuestionsStarted(state);

    await setSessionState({ sessionId: session.id, state: newState, currentCompetencyId: null });

    const message = buildOpenQuestionMessage(0, true, context.competencies.length);

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: null,
      telegramChatId: params.chatId,
      text: message,
    });

    logger.info("Rating phase complete, starting open questions", {
      sessionId: session.id,
      respondentId: context.respondent.id,
    });

    return { editText, reply: { text: message } };
  }

  // Move to next competency rating
  const newState = moveToNextRating(state);
  const nextCompetency = context.competencies[nextRatingIndex];

  await setSessionState({ sessionId: session.id, state: newState, currentCompetencyId: nextCompetency.id });

  const message = buildRatingMessage(nextCompetency, nextRatingIndex, context.competencies.length, false);

  await buildAndStoreAssistantQuestion({
    sessionId: session.id,
    competencyId: nextCompetency.id,
    telegramChatId: params.chatId,
    text: message,
  });

  return { editText, reply: { text: message, keyboard: RATING_KEYBOARD } };
}

// ── Command handlers ───────────────────────────────────────────────────────

export async function handleStartCommand(params: {
  inviteToken: string | null;
  telegramUserId: bigint;
  telegramUsername?: string;
  chatId: number;
}): Promise<BotReply> {
  const inviteToken = normalizeInviteToken(params.inviteToken);

  // No token: try to resume by known Telegram user ID
  if (!inviteToken || !isInviteTokenFormatValid(inviteToken)) {
    const context = await loadContextByTelegramUser(params.telegramUserId);
    if (!context) {
      return { text: INVITE_REQUIRED_TEXT };
    }
    return sendConsentAndResetSession(context, params.chatId, null);
  }

  const context = await loadContextByToken(inviteToken);

  if (!context) {
    return { text: INVITE_REQUIRED_TEXT };
  }

  if (context.respondent.telegramUserId && context.respondent.telegramUserId !== params.telegramUserId) {
    return { text: "Этот инвайт уже привязан к другому аккаунту Telegram. Обратитесь к администратору." };
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

  return sendConsentAndResetSession(context, params.chatId, inviteToken);
}

async function sendConsentAndResetSession(
  context: ActiveCampaignContext,
  chatId: number,
  inviteToken: string | null,
): Promise<BotReply> {
  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "completed" || session.completedAt) {
    return { text: "Интервью уже завершено. Спасибо за участие." };
  }

  // Always reset to consent so the "Начать" button works correctly
  const resetState = createInitialInterviewState();
  await setSessionState({
    sessionId: session.id,
    state: resetState,
    currentCompetencyId: context.competencies[0]?.id ?? null,
  });

  const consentMessage = [
    "Привет!",
    "Спасибо за готовность пройти опрос.",
    `Я помогу собрать обратную связь на ${context.campaign.subjectName}.`,
    "Сначала мы пройдем по оценке 10 компетенций, а в конце я задам открытые вопросы, на которые ты можешь отвечать как текстовыми, так и голосовыми сообщениями (как тебе удобнее).",
    "Твои ответы останутся анонимными, я не сохраняю твои данные, только сами ответы.",
    "",
    "Если готов(а) начинать, нажми на кнопку.",
  ].join("\n");

  await saveMessage({
    sessionId: session.id,
    competencyId: session.currentCompetencyId,
    senderType: SenderType.system,
    messageType: MessageType.system,
    rawText: "Session reset by /start command",
    metadata: { chatId, inviteToken },
  });

  await buildAndStoreAssistantQuestion({
    sessionId: session.id,
    competencyId: session.currentCompetencyId,
    telegramChatId: chatId,
    text: consentMessage,
  });

  return { text: consentMessage, keyboard: CONSENT_KEYBOARD };
}

export async function handleResumeCommand(telegramUserId: bigint, chatId: number): Promise<BotReply> {
  const context = await loadContextByTelegramUser(telegramUserId);

  if (!context) {
    return { text: INVITE_REQUIRED_TEXT };
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "consent") {
    const resumeConsentText = "Нажми кнопку ниже, чтобы начать опрос.";
    return { text: resumeConsentText, keyboard: CONSENT_KEYBOARD };
  }

  if (state.phase === "completed") {
    return { text: "Интервью уже завершено. Спасибо за участие." };
  }

  if (state.phase === "rating") {
    const competency = context.competencies[state.ratingIndex];

    if (!competency) {
      return { text: "Все оценки выставлены. Ожидайте следующего шага." };
    }

    const message = buildRatingMessage(competency, state.ratingIndex, context.competencies.length, false);
    return { text: message, keyboard: RATING_KEYBOARD };
  }

  if (state.phase === "open_questions") {
    const q = OPEN_QUESTIONS[state.openQuestionIndex];

    if (!q) {
      return { text: "Все вопросы уже заданы. Для завершения напишите /finish." };
    }

    return { text: buildOpenQuestionMessage(state.openQuestionIndex, false, context.competencies.length) };
  }

  // Legacy "interview" phase
  const competency =
    state.competencyIndex < context.competencies.length ? context.competencies[state.competencyIndex] : null;
  const step = getCurrentStep(state);
  const marker = competency ? getBehavioralMarkers(competency)[state.markerIndex] ?? null : null;
  const fallbackQuestion = competency ? buildFallbackQuestion(competency.name, step, marker) : "Продолжим интервью.";
  const resumeQuestion = state.lastQuestion ?? fallbackQuestion;

  await buildAndStoreAssistantQuestion({
    sessionId: session.id,
    competencyId: competency?.id,
    telegramChatId: chatId,
    text: resumeQuestion,
  });

  return { text: resumeQuestion };
}

export async function handleFinishCommand(telegramUserId: bigint): Promise<BotReply> {
  const context = await loadContextByTelegramUser(telegramUserId);

  if (!context) {
    return { text: INVITE_REQUIRED_TEXT };
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);

  if (state.phase === "completed") {
    return { text: "Интервью уже завершено." };
  }

  const closingMessage = await finalizeInterview(context, session.id, state);
  return { text: closingMessage };
}

export async function handleHelpCommand(): Promise<BotReply> {
  return { text: HELP_TEXT };
}

// ── Message handler ────────────────────────────────────────────────────────

export async function handleRespondentMessage(input: InboundMessage): Promise<BotReply> {
  const context = await loadContextByTelegramUser(input.telegramUserId);

  if (!context) {
    return { text: INVITE_REQUIRED_TEXT };
  }

  const session = await ensureSession(context);
  const state = parseInterviewState(session.currentState);
  const text = (input.transcriptText ?? input.text ?? "").trim();

  if (!text) {
    return { text: "Не удалось прочитать сообщение. Попробуйте отправить текст ещё раз." };
  }

  // Always save the user's message first
  // open_questions answers are not tied to a specific competency — use null so they
  // don't pollute competency-level extraction and go to "Общие рекомендации" instead
  const currentCompetencyId =
    state.phase === "rating"
      ? (context.competencies[state.ratingIndex]?.id ?? null)
      : state.phase === "open_questions"
        ? null
        : (context.competencies[state.competencyIndex]?.id ?? null);

  await saveMessage({
    sessionId: session.id,
    competencyId: currentCompetencyId,
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

  // ── Consent phase: remind to use button ─────────────────────────────────
  if (state.phase === "consent") {
    const reminder = "Нажми кнопку «Начать», чтобы приступить к опросу.";

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: null,
      telegramChatId: input.chatId,
      text: reminder,
    });

    return { text: reminder, keyboard: CONSENT_KEYBOARD };
  }

  // ── Rating phase: remind user to use buttons ─────────────────────────────
  if (state.phase === "rating") {
    const competency = context.competencies[state.ratingIndex];

    if (!competency) {
      return { text: "Используйте кнопки для ответа." };
    }

    const reminder =
      "Пожалуйста, воспользуйтесь кнопками ниже для оценки.\n\n" +
      buildRatingMessage(competency, state.ratingIndex, context.competencies.length, false);

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: competency.id,
      telegramChatId: input.chatId,
      text: reminder,
    });

    return { text: reminder, keyboard: RATING_KEYBOARD };
  }

  // ── Open questions phase ─────────────────────────────────────────────────
  if (state.phase === "open_questions") {
    const question = OPEN_QUESTIONS[state.openQuestionIndex];

    if (!question) {
      const closingMessage = await finalizeInterview(context, session.id, state);
      return { text: closingMessage };
    }

    // Skip optional question if user indicates so
    if (question.optional && looksLikeSkip(text)) {
      const closingMessage = await finalizeInterview(context, session.id, state);
      return { text: closingMessage };
    }

    const nextIndex = state.openQuestionIndex + 1;

    if (nextIndex >= OPEN_QUESTIONS.length) {
      const closingMessage = await finalizeInterview(context, session.id, state);
      return { text: closingMessage };
    }

    const newState = moveToNextOpenQuestion(state);

    await setSessionState({ sessionId: session.id, state: newState, currentCompetencyId: null });

    const nextMessage = buildOpenQuestionMessage(nextIndex, false, context.competencies.length);

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: null,
      telegramChatId: input.chatId,
      text: nextMessage,
    });

    return { text: nextMessage };
  }

  // ── Completed ────────────────────────────────────────────────────────────
  if (state.phase === "completed") {
    return { text: "Интервью уже завершено. Спасибо за участие." };
  }

  // ── Legacy "interview" phase (backward compatibility) ────────────────────
  if (looksLikeNoAnswer(text)) {
    const competency =
      state.competencyIndex < context.competencies.length ? context.competencies[state.competencyIndex] : null;
    let nextState = competency
      ? moveAfterQuestionLimit(state, competency)
      : { ...moveToNextMethodologyStep(state), markerQuestionCount: 0 };
    const nextCompetency =
      nextState.competencyIndex < context.competencies.length
        ? context.competencies[nextState.competencyIndex]
        : null;

    if (!nextCompetency) {
      const closingMessage = await finalizeInterview(context, session.id, nextState);
      return { text: closingMessage };
    }

    nextState = normalizeMarkerState(nextState, nextCompetency);
    const nextMarker = getBehavioralMarkers(nextCompetency)[nextState.markerIndex] ?? null;
    const nextStep = getCurrentStep(nextState);
    const question = buildFallbackQuestion(nextCompetency.name, nextStep, nextMarker);

    const storedState = incrementMarkerQuestionCount({
      ...nextState,
      phase: "interview",
      lastQuestion: question,
    });

    await setSessionState({ sessionId: session.id, state: storedState, currentCompetencyId: nextCompetency.id });

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: nextCompetency.id,
      telegramChatId: input.chatId,
      text: question,
    });

    return { text: question };
  }

  try {
    const question = await askNextQuestion({
      context,
      sessionId: session.id,
      state,
      telegramChatId: input.chatId,
    });
    return { text: question };
  } catch (error) {
    logger.error("Failed to generate next interview question", {
      sessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });

    const fallback = "Спасибо. Зафиксировал ответ. Можете добавить ещё один конкретный пример по этой компетенции?";

    const competency =
      state.competencyIndex < context.competencies.length ? context.competencies[state.competencyIndex] : null;

    await buildAndStoreAssistantQuestion({
      sessionId: session.id,
      competencyId: competency?.id,
      telegramChatId: input.chatId,
      text: fallback,
    });

    return { text: fallback };
  }
}

// ── Legacy "interview" phase helpers ──────────────────────────────────────

function getBehavioralMarkers(competency: Competency): string[] {
  if (!Array.isArray(competency.behavioralMarkers)) {
    return [];
  }
  return competency.behavioralMarkers.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMarkerState(state: InterviewState, competency: Competency): InterviewState {
  const markers = getBehavioralMarkers(competency);

  if (!markers.length || state.markerIndex >= markers.length) {
    return { ...state, markerIndex: 0, markerQuestionCount: 0 };
  }

  return state;
}

function moveToNextMarkerOrCompetency(state: InterviewState, competency: Competency): InterviewState {
  const markers = getBehavioralMarkers(competency);

  if (!markers.length) {
    return moveToNextCompetency(state);
  }

  if (state.markerIndex + 1 < markers.length) {
    return moveToNextMarker(state);
  }

  return moveToNextCompetency(state);
}

function moveAfterQuestionLimit(state: InterviewState, competency: Competency): InterviewState {
  const markers = getBehavioralMarkers(competency);

  if (markers.length > 0) {
    return moveToNextMarkerOrCompetency(state, competency);
  }

  return { ...moveToNextMethodologyStep(state), markerQuestionCount: 0 };
}

async function askNextQuestion(params: {
  context: ActiveCampaignContext;
  sessionId: string;
  state: InterviewState;
  telegramChatId: number;
}): Promise<string> {
  let workingState = params.state;
  let currentCompetency =
    workingState.competencyIndex < params.context.competencies.length
      ? params.context.competencies[workingState.competencyIndex]
      : null;

  if (!currentCompetency) {
    return finalizeInterview(params.context, params.sessionId, workingState);
  }

  workingState = normalizeMarkerState(workingState, currentCompetency);

  if (workingState.markerQuestionCount >= MAX_QUESTIONS_PER_MARKER) {
    const previousMarker = getBehavioralMarkers(currentCompetency)[workingState.markerIndex] ?? null;
    workingState = moveAfterQuestionLimit(workingState, currentCompetency);
    currentCompetency =
      workingState.competencyIndex < params.context.competencies.length
        ? params.context.competencies[workingState.competencyIndex]
        : null;

    if (!currentCompetency) {
      return finalizeInterview(params.context, params.sessionId, workingState);
    }

    workingState = normalizeMarkerState(workingState, currentCompetency);

    logger.info("Marker question limit reached, switching focus", {
      sessionId: params.sessionId,
      previousMarker,
      competencyId: currentCompetency.id,
      markerIndex: workingState.markerIndex,
    });
  }

  const step = getCurrentStep(workingState);
  const marker = getBehavioralMarkers(currentCompetency)[workingState.markerIndex] ?? null;
  const history = await getSessionHistory(params.sessionId);

  const systemPrompt = buildInterviewSystemPrompt({
    campaignTitle: params.context.campaign.title,
    subjectName: params.context.campaign.subjectName,
    competency: currentCompetency,
    step,
    marker,
    markerQuestionCount: workingState.markerQuestionCount,
    markerQuestionLimit: MAX_QUESTIONS_PER_MARKER,
  });

  const decision = await generateInterviewDecision({ systemPrompt, history });

  let nextState = workingState;

  if (decision.finish_interview) {
    return finalizeInterview(params.context, params.sessionId, nextState);
  }

  if (decision.move_next_competency) {
    nextState = moveToNextCompetency(nextState);
  } else if (decision.advance_step) {
    nextState = moveToNextMethodologyStep(nextState);
  }

  let nextCompetency =
    nextState.competencyIndex < params.context.competencies.length
      ? params.context.competencies[nextState.competencyIndex]
      : null;

  if (!nextCompetency) {
    return finalizeInterview(params.context, params.sessionId, nextState);
  }

  nextState = normalizeMarkerState(nextState, nextCompetency);
  let nextMarker = getBehavioralMarkers(nextCompetency)[nextState.markerIndex] ?? null;
  let nextStep = getCurrentStep(nextState);
  let question = decision.next_question?.trim() || buildFallbackQuestion(nextCompetency.name, nextStep, nextMarker);

  if (isRepeatedQuestion(workingState.lastQuestion, question)) {
    const stateMovedByModel =
      nextState.competencyIndex !== workingState.competencyIndex ||
      nextState.stepIndex !== workingState.stepIndex ||
      nextState.markerIndex !== workingState.markerIndex;

    if (!stateMovedByModel) {
      nextState = moveToNextMethodologyStep(nextState);
      const forcedCompetency =
        nextState.competencyIndex < params.context.competencies.length
          ? params.context.competencies[nextState.competencyIndex]
          : null;

      if (!forcedCompetency) {
        return finalizeInterview(params.context, params.sessionId, nextState);
      }

      nextCompetency = forcedCompetency;
      nextState = normalizeMarkerState(nextState, forcedCompetency);
      nextMarker = getBehavioralMarkers(forcedCompetency)[nextState.markerIndex] ?? null;
      nextStep = getCurrentStep(nextState);
      question = buildFallbackQuestion(forcedCompetency.name, nextStep, nextMarker);

      logger.warn("Interview loop prevention: forced methodology step advance", {
        sessionId: params.sessionId,
        previousQuestion: workingState.lastQuestion,
        repeatedQuestion: decision.next_question,
      });
    } else {
      question = buildFallbackQuestion(nextCompetency.name, nextStep, nextMarker);
    }
  }

  let storedState: InterviewState = {
    ...nextState,
    phase: "interview",
    lastQuestion: question,
  };

  storedState = incrementMarkerQuestionCount(storedState);

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
