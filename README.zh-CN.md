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

[English README](./README.md)

VA-11 Chat 是一个极简 Node.js + TypeScript 聊天室应用。
它刻意保持简单：一个长驻 Node.js 进程、Vite + React 前端、原生 WebSocket、
本地文件存储、加密消息历史，以及接近 HTML 默认样式的页面。

## 为什么叫 VA-11 Chat

这个名字的灵感来自游戏 VA-11 的氛围：一个小小的吧台、安静的夜晚，以及那些可以
从日常琐事慢慢聊到心里话的对话。VA-11 Chat 想把这种感觉带到一个简单的网页聊天
室里，让人可以放松下来，畅所欲言，而不是被复杂的产品形态打断。

## 功能

- 管理员通过网页创建频道和频道用户
- 用户按频道输入密码登录
- 使用原生 WebSocket 实时聊天
- 不同频道消息隔离
- 消息显示昵称和内容
- 其他用户发消息时可触发浏览器通知
- 聊天记录使用 AES-256-GCM 加密落盘
- 每个频道保留最近 100 条消息
- 不使用数据库、ORM 或组件库
- 兼容桌面和移动端浏览器的响应式布局

## 技术栈

- Node.js
- TypeScript
- Vite
- React
- Express
- `ws`
- 本地 JSON / JSONL 文件

## 环境要求

- Node.js 22.x
- npm

## 快速开始

```sh
npm install
cp .env.example .env
ADMIN_PASSWORD=change-me COOKIE_SECRET=dev-cookie-secret MESSAGE_SECRET=dev-message-secret npm run dev
```

打开：

- 用户登录页：<http://localhost:3000/>
- 管理员页面：<http://localhost:3000/admin>

## 项目官网

静态项目官网位于 [`docs/`](./docs/)。它会通过
[`CI and Pages`](./.github/workflows/pages.yml) 这个 GitHub Actions workflow 部署到
GitHub Pages。仓库设置中请把 GitHub Pages 的构建和部署来源设置为
**GitHub Actions**。

## 脚本

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

测试会先执行生产构建，再通过 Vitest 运行。`commitlint` 只检查最近一次提交区间；默认
不会安装 git hooks。

## 配置

环境变量：

| 名称                    | 是否必填     | 默认值         | 说明                                                    |
| ----------------------- | ------------ | -------------- | ------------------------------------------------------- |
| `PORT`                  | 否           | `3000`         | HTTP/WebSocket 服务端口                                 |
| `ADMIN_PASSWORD`        | 是           | 无             | 管理员登录密码                                          |
| `COOKIE_SECRET`         | 生产环境必填 | 开发环境兜底值 | 签名 Cookie 密钥                                        |
| `MESSAGE_SECRET`        | 生产环境必填 | 开发环境兜底值 | 聊天记录加密密钥                                        |
| `DATA_DIR`              | 否           | `data`         | 本地数据目录                                            |
| `INITIAL_CHANNELS_PATH` | 否           | 无             | 当运行时 `channels.json` 不存在时，用该 JSON 文件初始化 |
| `NODE_ENV`              | 否           | 无             | 设置为 `production` 后启用生产配置校验                  |

生产环境必须显式设置 `ADMIN_PASSWORD`、`COOKIE_SECRET` 和
`MESSAGE_SECRET`。生产环境中 `COOKIE_SECRET` 和 `MESSAGE_SECRET` 不能相同。

## 数据存储

运行时数据保存在 `DATA_DIR`：

```text
data/
  channels.json
  messages/
    {channelId}.jsonl
```

`channels.json` 保存频道元数据、昵称和密码哈希。消息文件保存加密后的 JSONL
记录。

如果设置了 `INITIAL_CHANNELS_PATH`，并且 `DATA_DIR/channels.json` 还不存在，
服务启动时会把该初始频道 JSON 写入 `DATA_DIR/channels.json`。已有运行时数据不会被
初始文件覆盖。

`data/` 目录已被 git 忽略。

## 隐私说明

聊天记录在写入 `data/messages/*.jsonl` 前会使用 AES-256-GCM 加密。只读取消息
文件的人看不到明文聊天内容。

这不是端到端加密。服务端需要使用 `MESSAGE_SECRET` 解密历史消息，以便展示旧消息
和广播新消息。如果有人能读取服务器环境变量，或者能控制正在运行的 Node.js 进程，
仍然可能访问聊天内容。

请像保护数据库密码一样保护 `MESSAGE_SECRET`。

## 安全说明

- 生产环境 Cookie 会启用 `Secure` 标记，请使用 HTTPS。
- 登录接口使用内存限速：同一 IP 每 10 分钟最多尝试 10 次。
- WebSocket 发言使用内存限速：同一用户每 10 秒最多发送 8 条消息。
- 服务重启后限速状态会清空。
- 多实例部署时限速状态不会共享。
- 本项目面向小规模单实例部署。

## 部署

请使用支持长驻 Node.js 进程和 WebSocket 连接的平台，例如 Render 或小型 VPS。

如果生产环境继续使用本地文件存储，请配置持久化磁盘，并保持单实例运行。

### Docker Compose

创建生产环境变量文件：

```sh
cp .env.production.example .env.production
```

编辑 `.env.production`，为 `ADMIN_PASSWORD`、`COOKIE_SECRET` 和
`MESSAGE_SECRET` 设置足够强、互不相同的值。生产环境中 `COOKIE_SECRET` 和
`MESSAGE_SECRET` 不能相同。

构建并启动应用：

```sh
docker compose up --build -d
```

打开：

- 用户登录页：<http://localhost:3000/>
- 管理员页面：<http://localhost:3000/admin>

运行时数据会保存在名为 `va-11-data` 的 Docker volume 中，并挂载到容器内的
`/app/data`。如果你关心频道配置或聊天记录，请备份这个 volume。

正式对外服务时，建议在 VA-11 Chat 前面放 Caddy、Nginx 或 Traefik 等反向代理并启用
HTTPS。生产环境 Cookie 会使用安全配置，本地测试之外应通过 HTTPS 访问。

Vercel Serverless Functions 不适合本项目的原生 WebSocket 服务端模型。如果要把
前端部署在 Vercel，建议使用独立实时服务，或把长驻后端部署到其他平台。

## 项目结构

```text
src/server.ts               应用服务端、API 路由、WebSocket 装配
src/client/                 Vite + React 前端
src/client/src/pages/       页面组件和就近 CSS
src/client/src/shared/      少量浏览器端共享工具
src/storage.ts              本地文件存储与加密消息历史
tests/                      Vitest 集成测试
data/                       运行时数据，已被 git 忽略
```

## 贡献

欢迎贡献。请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 许可证

MIT
