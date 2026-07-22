# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-22

### Added

- Installable PWA support with a standalone home-screen experience, application icons, manifest,
  and offline application shell.
- Automatic session recovery that opens the last authenticated chat room from the PWA or site
  root.
- Optional 30-day trusted-device login backed by an `HttpOnly` cookie.
- Live, reconnecting, and offline connection indicators in the chat toolbar.
- Stable message identifiers for reconnect-safe message de-duplication.
- Server-side WebSocket ping/pong heartbeats for detecting stale mobile and proxy connections.

### Changed

- Consolidated notification handling and PWA caching into one service worker.
- Improved the mobile chat toolbar layout to accommodate connection and installation controls.
- Documented home-screen installation, session persistence, and the current Web Push boundary.

### Fixed

- Reconnect automatically after WebSocket disconnects, network changes, and returning from a
  suspended mobile browser.
- Re-sync recent message history after reconnection so messages received during an interruption
  become visible without refreshing the browser.
- Preserve the message composer contents when a send is attempted while disconnected.

## [1.0.0] - 2026-06-15

### Added

- Initial VA-11 Chat release with password-protected channels, native WebSocket chat, encrypted
  local message history, browser notifications, and the administration interface.

[1.1.0]: https://github.com/roark47/va-11-chat/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/roark47/va-11-chat/releases/tag/v1.0.0
