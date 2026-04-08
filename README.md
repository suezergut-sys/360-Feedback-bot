# 360 Feedback AI Bot

Telegram-бот и веб-панель для проведения опросов 360° обратной связи.

- Структурированный опрос по 10 компетенциям через кнопки Telegram
- Открытые вопросы голосом или текстом
- Автоматическое извлечение инсайтов и генерация отчётов через OpenAI
- Админ-панель на Next.js для управления кампаниями, респондентами и отчётами
- Serverless-деплой на Vercel + PostgreSQL (Supabase)

---

## Стек

| Слой | Технологии |
|------|-----------|
| Frontend / Backend | Next.js 15 App Router + TypeScript |
| БД | PostgreSQL + Prisma 6 |
| Telegram | Bot API (webhook, inline keyboard, callback_query) |
| AI | OpenAI API — интервью, извлечение, отчёты, транскрипция голоса |
| Валидация | Zod |
| Auth | bcryptjs + jose (JWT cookie) |
| KV (опционально) | Upstash Redis / Vercel KV |
| Тесты | Vitest |

---

## Функциональность

### Telegram-бот — поток опроса

```
/start <token>
  └─ Приветствие с именем оцениваемого
     └─ Кнопка [Начать]
        └─ Рейтинг 10 компетенций (inline keyboard 1–5 / N/A)
           └─ 4 открытых вопроса (текст или голос)
              └─ Завершение → запуск анализа
```

1. **Согласие** — приветственное сообщение с кнопкой «Начать»
2. **Оценка компетенций** — по каждой компетенции показывается название, блок и описание; респондент нажимает одну из кнопок: `1 2 3 4 5 N/A`
3. **Открытые вопросы** — текстом или голосом:
   - Сильные стороны руководителя
   - Зоны развития
   - Поведение, мешающее эффективности
   - Дополнительные комментарии (необязательно)
4. **Завершение** — автоматически запускается извлечение данных и генерация отчётов

Дополнительные команды: `/resume`, `/finish`, `/help`

### 10 компетенций (предустановленные)

При создании новой кампании автоматически добавляются все 10 компетенций:

| # | Компетенция | Блок |
|---|-------------|------|
| 1 | Критическое мышление | Аналитические способности |
| 2 | Системное мышление | Аналитические способности |
| 3 | Логика и аргументация | Аналитические способности |
| 4 | Лидерство и влияние | Управление людьми |
| 5 | Управление командой | Управление людьми |
| 6 | Эффективная коммуникация | Управление людьми |
| 7 | Гибкость и адаптивность | Гибкость и изменения |
| 8 | Открытость к развитию | Гибкость и изменения |
| 9 | Ориентация на результат | Мотивация и драйв |
| 10 | Инициативность | Мотивация и драйв |

Компетенции можно включать/отключать и редактировать в админ-панели.

### Шкала оценки

```
1 — Почти никогда
2 — Редко
3 — Иногда
4 — Часто
5 — Почти всегда
N/A — Не было возможности наблюдать
```

### Админ-панель

- Список кампаний с возможностью удаления (каскадно удаляет все данные)
- Создание / редактирование кампании
- Управление компетенциями
- Управление респондентами + генерация инвайт-ссылок
- Дашборд прогресса
- Просмотр сырых ответов
- Просмотр и повторная генерация отчётов
- Визуальный отчёт 360 с группировкой по ролям

### Анализ и отчёты

- Извлечение структурированной обратной связи из ответов (OpenAI, JSON mode)
- Компетентностные отчёты + сводный отчёт по кампании
- Артефакты хранятся в БД (Markdown + JSON)
- Повторная генерация через UI или API
- Асинхронная очередь задач с retry и soft-lock

---

## Структура проекта

```
/src
  /app
    /(auth)/login              # Вход в админ-панель
    /(admin)/campaigns         # UI кампаний
    /api/telegram/webhook      # Webhook Telegram
    /api/campaigns/[id]        # DELETE кампании
    /api/cron/jobs             # Обработчик очереди
    /api/health                # Health check
  /components                  # React компоненты
  /data
    competency-templates.ts    # 10 предустановленных компетенций
  /lib
    /auth                      # JWT сессия
    /audio                     # Транскрипция голоса
    /db                        # Prisma клиент
    /jobs                      # Очередь и процессор задач
    /kv                        # Redis/KV клиент
    /logging                   # Структурированные логи
    /openai                    # OpenAI API
    /security                  # Rate limit, prompt safety
    /telegram                  # Telegram Bot API клиент
    /validators                # Zod схемы
  /modules
    /campaigns                 # CRUD кампаний
    /competencies              # CRUD компетенций
    /interviews                # Состояние и логика опроса
    /reports                   # Генерация и сборка отчётов
    /respondents               # Токены и статусы
  /prompts                     # Системные промпты для OpenAI
  /types
  /utils
/prisma
  /migrations
  schema.prisma
  seed.ts
/scripts
  readlink-patch.cjs           # Патч для Windows-сборки
```

---

## Модель данных (Prisma)

| Модель | Назначение |
|--------|-----------|
| `Admin` | Учётные записи администраторов |
| `Campaign` | Кампании 360° |
| `CompetencyTemplate` | Глобальная библиотека шаблонов компетенций |
| `Competency` | Компетенции кампании (создаются из шаблонов) |
| `Respondent` | Участники опроса |
| `InterviewSession` | Сессии с состоянием опроса |
| `Message` | Лог переписки (текст + голос) |
| `CompetencyRating` | Оценки 1–5/N/A по компетенциям (кнопки) |
| `CompetencyFeedback` | Извлечённая обратная связь по компетенции |
| `AnalysisReport` | Финальные отчёты (Markdown + JSON) |
| `Job` | Очередь фоновых задач |
| `TelegramUpdateLog` | Идемпотентность webhook-обновлений |

Все связи от `Campaign`, `Respondent`, `InterviewSession` настроены на каскадное удаление.

Миграции:
- `20260323180000_init`
- `20260407184417_add_respondent_role_profile`
- `20260408120000_add_competency_templates_and_ratings`

---

## Переменные окружения

Скопировать из `.env.example`:

```env
# PostgreSQL (обязательно)
DATABASE_URL=
DIRECT_URL=

# OpenAI (обязательно)
OPENAI_API_KEY=

# Telegram (обязательно)
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_BOT_USERNAME=   # опционально, для красивых t.me ссылок

# Приложение
APP_BASE_URL=
AUTH_SECRET=
CRON_SECRET=

# Upstash Redis / Vercel KV (опционально)
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

> KV-переменные опциональны. Без них система работает на DB-fallback и in-memory fallback.

---

## Локальная установка

```bash
# 1. Зависимости
npm install

# 2. Конфигурация
cp .env.example .env
# заполнить значения

# 3. Миграция БД
npm run prisma:migrate:dev

# 4. Генерация Prisma-клиента (если нужно отдельно)
npm run prisma:generate

# 5. Демо-данные
npm run prisma:seed
```

Seed создаёт:
- Администратор: `admin@360bot.local` / `ChangeMe123!`
- Демо-кампания с 10 компетенциями и 3 респондентами
- Шаблоны компетенций в таблице `competency_templates`

```bash
# 6. Запуск
npm run dev
```

---

## Настройка Telegram webhook

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.vercel.app/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

Проверить статус:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

---

## Cron / обработка задач

```
POST /api/cron/jobs
Authorization: Bearer <CRON_SECRET>
```

На Vercel настроен в `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/jobs", "schedule": "0 9 * * *" }]
}
```

---

## Деплой на Vercel

1. Пуш репозитория на GitHub
2. Импортировать проект в Vercel
3. Добавить переменные окружения
4. Подключить PostgreSQL (например, Supabase) и задать `DATABASE_URL` / `DIRECT_URL`
5. Применить миграции:

```bash
npx prisma migrate deploy
```

6. Сид (один раз, опционально):

```bash
npm run prisma:seed
```

7. Настроить Telegram webhook на продакшн URL
8. Cron настроен автоматически через `vercel.json`

---

## Безопасность

- Парольная аутентификация администратора (bcryptjs)
- Подписанная сессионная cookie (jose / JWT, 7 дней)
- Защищённые admin-маршруты
- Валидация секрета Telegram webhook
- Rate limiting (50 запросов / 60 сек на пользователя)
- Санитизация пользовательского ввода перед подстановкой в промпты
- Zod-валидация на всех внешних границах

---

## Тесты

```bash
npm test
```

Покрытие:
- Валидация инвайт-токенов
- Переходы состояний интервью
- Парсинг схемы извлечения
- Утилиты сборки отчётов

---

## Сборка и проверка

```bash
npm run lint
npm test
npm run build
```

> **Windows:** патч `scripts/readlink-patch.cjs` исправляет поведение `fs.readlink` (`EISDIR` → `EINVAL`) при сборке webpack. Применяется автоматически через `NODE_OPTIONS` в npm-скрипте `build`. На Linux/Vercel патч не нужен.

---

## Health check

```
GET /api/health
```

---

## Ограничения текущей версии

- Один администратор на инстанс (нет multi-tenant RBAC)
- Нет PDF/DOCX экспорта
- Нет автоматических напоминаний респондентам
- Нет расширенного audit trail UI
