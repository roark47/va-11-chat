# Contributing

Thanks for your interest in contributing.

This project intentionally keeps the implementation small and boring. Before
adding a feature, prefer the simplest version that fits the current architecture:

- one Node.js process
- Vite + React for the browser UI
- native WebSocket via `ws`
- local file storage
- no database
- minimal HTML and CSS styling

## Development

```sh
npm install
ADMIN_PASSWORD=change-me COOKIE_SECRET=dev-cookie-secret MESSAGE_SECRET=dev-message-secret npm run dev
```

## Checks

Run these before opening a pull request:

```sh
npm run format:check
npm run lint
npm test
```

## Pull Request Guidelines

- Keep changes focused.
- Add or update tests for behavior changes.
- Avoid unrelated refactors.
- Do not commit runtime data from `data/`.
- Do not commit secrets or `.env` files.

## Security

Do not open public issues for sensitive security reports. If this project is
published under a repository with security advisories enabled, use that private
reporting channel.
