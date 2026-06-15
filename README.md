# VA-11 Chat

<p align="center">
  <img src="./docs/assets/logo.png" alt="VA-11 Chat logo" width="96" />
</p>

<p align="center">
  <a href="https://github.com/lbfsc/va-11/actions/workflows/pages.yml"><img src="https://github.com/lbfsc/va-11/actions/workflows/pages.yml/badge.svg" alt="CI and Pages" /></a>
  <a href="https://github.com/lbfsc/va-11/deployments/github-pages"><img src="https://img.shields.io/badge/GitHub%20Pages-docs-2ea44f?logo=github" alt="GitHub Pages" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <img src="https://img.shields.io/badge/Node.js-22.x-5fa04e?logo=nodedotjs" alt="Node.js 22.x" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript 5.x" />
</p>

[中文文档](./README.zh-CN.md)

VA-11 Chat is a small Node.js + TypeScript chat room application.
It is intentionally simple: one long-running Node.js process, a Vite + React
frontend, native WebSocket connections, file-based storage, encrypted message
history, and mostly default HTML styling.

## Why VA-11 Chat

The name is inspired by the atmosphere of the game VA-11: a small counter, a
quiet night, and conversations that can drift from ordinary details to the
things people rarely say out loud. VA-11 Chat tries to carry that feeling into a
simple web chat: a relaxed place where people can show up, slow down, and talk
freely without the product getting in the way.

## Features

- Admin web page for creating channels and channel users
- Password-based user login per channel
- Real-time chat over the native WebSocket protocol
- Channel-isolated messages
- Nickname + message display
- Browser notifications for messages from other users
- Encrypted local message history with AES-256-GCM
- Keeps the latest 100 messages per channel
- No database, ORM, or component library
- Responsive layout for desktop and mobile browsers

## Tech Stack

- Node.js
- TypeScript
- Vite
- React
- Express
- `ws`
- Local JSON / JSONL files

## Requirements

- Node.js 22.x
- npm

## Quick Start

```sh
npm install
cp .env.example .env
ADMIN_PASSWORD=change-me COOKIE_SECRET=dev-cookie-secret MESSAGE_SECRET=dev-message-secret npm run dev
```

Open:

- User login: <http://localhost:3000/>
- Admin page: <http://localhost:3000/admin>

## Project Website

The static project website lives in [`docs/`](./docs/). It is deployed by
GitHub Actions through the [`CI and Pages`](./.github/workflows/pages.yml)
workflow. In the repository settings, set GitHub Pages to **GitHub Actions** as
the build and deployment source.

## Scripts

```sh
npm run dev
npm run build
npm start
npm run format
npm run format:check
npm run lint
npm test
npm run test:watch
npm run commitlint
```

Tests run through Vitest after a production build. `commitlint` checks the last
commit range only; no git hooks are installed by default.

## Configuration

Environment variables:

| Name                    | Required          | Default              | Description                                                                            |
| ----------------------- | ----------------- | -------------------- | -------------------------------------------------------------------------------------- |
| `PORT`                  | No                | `3000`               | HTTP/WebSocket server port                                                             |
| `ADMIN_PASSWORD`        | Yes               | none                 | Admin login password                                                                   |
| `COOKIE_SECRET`         | Yes in production | development fallback | Signed cookie secret                                                                   |
| `MESSAGE_SECRET`        | Yes in production | development fallback | Message encryption secret                                                              |
| `DATA_DIR`              | No                | `data`               | Local data directory                                                                   |
| `INITIAL_CHANNELS_PATH` | No                | none                 | Seed `DATA_DIR/channels.json` from this JSON file when the runtime file does not exist |
| `NODE_ENV`              | No                | none                 | Set to `production` for production checks                                              |

Production mode requires `ADMIN_PASSWORD`, `COOKIE_SECRET`, and
`MESSAGE_SECRET`. In production, `COOKIE_SECRET` and `MESSAGE_SECRET` must be
different.

## Data Storage

The app stores runtime data in `DATA_DIR`:

```text
data/
  channels.json
  messages/
    {channelId}.jsonl
```

`channels.json` contains channel metadata, nicknames, and password hashes.
Message files contain encrypted JSONL records.

If `INITIAL_CHANNELS_PATH` is set and `DATA_DIR/channels.json` does not exist,
the server copies the initial channels JSON into `DATA_DIR/channels.json` during
startup. Existing runtime data is never overwritten by the initial file.

The `data/` directory is ignored by git.

## Privacy Notes

Message history is encrypted at rest using AES-256-GCM before being written to
`data/messages/*.jsonl`. Someone who only reads the message files cannot see
the plaintext chat content.

This is not end-to-end encryption. The server decrypts history with
`MESSAGE_SECRET` so it can display old messages and broadcast new ones. Anyone
who can read server environment variables or control the running Node.js process
may still be able to access chat contents.

Protect `MESSAGE_SECRET` like a database password.

## Security Notes

- Production cookies use the `Secure` flag. Use HTTPS in production.
- Login attempts are rate-limited in memory: 10 attempts per IP per 10 minutes.
- WebSocket messages are rate-limited in memory: 8 messages per user per 10 seconds.
- Rate limits reset when the process restarts.
- Rate limits are not shared across multiple instances.
- This project is designed for small single-instance deployments.

## Deployment

Use a platform that supports long-running Node.js processes and WebSocket
connections, such as Render or a small VPS.

If you use local file storage in production, configure persistent disk storage
and run a single instance.

### Docker Compose

Create a production environment file:

```sh
cp .env.production.example .env.production
```

Edit `.env.production` and set strong, unique values for `ADMIN_PASSWORD`,
`COOKIE_SECRET`, and `MESSAGE_SECRET`. `COOKIE_SECRET` and `MESSAGE_SECRET`
must be different in production.

Build and start the app:

```sh
docker compose up --build -d
```

Open:

- User login: <http://localhost:3000/>
- Admin page: <http://localhost:3000/admin>

Runtime data is stored in the `va-11-data` Docker volume, mounted at
`/app/data` inside the container. Back up this volume if you care about channel
configuration or message history.

For HTTPS, run VA-11 Chat behind a reverse proxy such as Caddy, Nginx, or
Traefik. The app uses secure cookies in production, so browsers should access it
over HTTPS outside local testing.

Vercel Serverless Functions are not a good fit for this native WebSocket server
model. If you want to deploy the frontend on Vercel, use a separate real-time
service or a long-running backend elsewhere.

## Project Structure

```text
src/server.ts               Application server, API routes, WebSocket wiring
src/client/                 Vite + React frontend
src/client/src/pages/       Page components with co-located CSS
src/client/src/shared/      Small shared browser utilities
src/storage.ts              Local file storage and encrypted message history
tests/                      Vitest integration tests
data/                       Runtime data, ignored by git
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
