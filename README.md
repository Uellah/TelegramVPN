# Telegram Mini App

Минимальное приложение Telegram Mini App на Node.js с Express и ботом.

## Требования

- Node.js 18+
- Telegram-бот (создать через [@BotFather](https://t.me/botfather))

## Локальный запуск

1. **Клонируйте и установите зависимости:**

```bash
cd TelagramVPN
npm install
```

2. **Создайте `.env` из примера:**

```bash
cp .env.example .env
```

3. **Заполните `.env`:**

```
BOT_TOKEN=ваш_токен_от_BotFather
WEBAPP_URL=https://ваш-домен.ngrok.io
PORT=3000
```

> Для локальной разработки Mini App нужен HTTPS. Используйте [ngrok](https://ngrok.com): `ngrok http 3000` — возьмите HTTPS-URL в `WEBAPP_URL`.

4. **Настройте Mini App в BotFather:**

- Отправьте `/mybots` → выберите бота → Bot Settings → Configure Mini App
- Укажите URL дашборда: `https://ваш-домен/dashboard`

5. **Запустите сервер:**

```bash
npm run dev
```

Откройте бота в Telegram, отправьте `/start` и нажмите «Открыть приложение».

## Деплой на Render

1. **Создайте аккаунт на [Render](https://render.com).**

2. **New → Web Service**, подключите репозиторий (GitHub/GitLab).

3. **Настройки:**
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node

4. **Environment Variables (секреты):**
   - `BOT_TOKEN` — токен бота от BotFather
   - `WEBAPP_URL` — URL сервиса Render (например `https://your-app.onrender.com`)
   - `USE_WEBHOOK=true` — обязательно на Render, иначе конфликт 409 при редеплое
   - `PORT` — Render задаёт сам, можно не указывать

5. ** deploy** — Render запустит сборку и деплой.

6. **Настройте Mini App в BotFather:**
   - Bot Settings → Configure Mini App → укажите `https://your-app.onrender.com/dashboard`

## Mini App (Dashboard)

React-дашборд — Mini App. Открывается по кнопке «Открыть приложение» при `/start`.

**Разработка:**
```bash
npm run dev
```
Сервер: http://localhost:3000, дашборд: http://localhost:5173 (Vite)

**Продакшен:** Build command: `npm install && npm run build`

## Структура проекта

```
├── server.js         # Express + API + Bot
├── src/              # React Mini App (дашборд)
├── index.html        # Vite entry
├── vite.config.js
├── .env
└── package.json
```

## API

- `POST /api/me` — принимает `{ initData }`, проверяет подпись и возвращает `{ ok: true, user }`.
- `GET /api/stats` — заглушка: статистика сервера (CPU, память, сеть, подключения).
- `GET /api/servers` — заглушка: список серверов.
