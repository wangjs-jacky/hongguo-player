# 红果 Web V6：原版 App 前端复用

2026-11-23。按用户要求，直接复用 `hongguo-v1.2.31-macos-universal.zip` 内的原版 Wails 前端，停止重画页面。正式入口和端口不变，静态版本由 5.0 升为 6.0。

## 实现

- 原版资源：`index.html`、`assets/index.e161c0d9.js`、`assets/index.df4b21b5.js`、`assets/index.c2f2550a.css`、`assets/worker.341dbbcf.js`、`assets/hevcdec.e298f353.wasm`。
- 原版运行时：`/wails/runtime.js` 首行保留 `window.wailsbindings=...;`，前端读取该行后拼接内置 Wails runtime。
- 适配层：`adapter.js` 把 `window.go.app.App.*` 的 Wails 调用映射到本站 REST 接口；未修改原版 Vue 页面、CSS、路由和图标。
- 正式源码：`server/web-v6/`；发布副本：`server/public/`。
- 静态服务支持 `/assets/*`、`/wails/*`、`/media/*`，包含 `HEAD`、`Range`、206/416 和路径越界保护；CSP 允许原版注入的内联 runtime 与样式。

## 结构与接口

| 原版路由 | 数据来源 |
|---|---|
| `/recommend` | `/api/catalog?category=hot-drama` 与 `/api/series/:id` |
| `/search` | `/api/search?q=` |
| `/rank` | `/api/catalog` 四个榜单分类 |
| `/new` | `/api/catalog` 近期片单 |
| `/series/:id` | `/api/series/:id`、演员与相关推荐接口 |
| `/history`、`/favorites`、`/likes`、`/reservations`、`/follows` | 当前浏览器 localStorage |
| `/play/:seriesId/:videoId` | `/api/session`、`/api/play`，失败时使用本地 H.264 演示片 |
| `/messages`、`/downloads` | 原版空状态；原生客户端专属数据未伪造 |
| `/settings` | 原版本地设置与空响应占位 |

收藏、点赞、历史、预约和追更写入 `localStorage`，刷新后保留。搜索、排行榜、新剧、详情和演员作品继续使用真实红果目录。

## 真实片源解析

2026-11-24 起，`/api/play` 优先通过官方桌面版 `1.2.32` 的取流模型（模型版本 `7.4.3.32`）取得红果分集，不再依赖旧 Web 播放接口：

- 剧集上下文：`POST /novel/player/multi_video_detail/preload/v1`，读取分集的 `content_type`。
- 单集取流：`POST /novel/player/video_model/v1/`，解析返回的 JSON 字符串 `video_model`，选择真实 CDN、清晰度、编码和 CENC key。
- 鉴权：MetaSec v5/SDI 签名材料取自官方桌面版内置资源，保存于 `server/native/metasec/`。
- 实现：`server/native/hg-resolve` 是长驻 Rust 侧车，`server/hg-resolve.cjs` 通过 stdin/stdout 逐行 JSON 调用；设备档案保存在 `.web-runtime/hg-resolve-device.json`。
- 参考实现：`NeeYoonc/hongguo-web-player` 的 Rust 取流库与 `hg-resolve`，其许可证为 PolyForm Noncommercial 1.0.0；官方桌面版的内置签名材料仍归原权利人。

`server/online.cjs` 把 `bytevc1` 映射为 `hevc`，并把 `cenc_key_hex` 交给 `server/range-media.cjs` 解密；没有 `seriesId` 或侧车不可用时才回退旧 `web-v2` 接口。`/api/play` 返回真实 `duration`、`size` 和分辨率，Range 响应为 `206 video/mp4`。

## 播放与兼容回退

支持 HEVC 的浏览器直接播放真实分集。浏览器不支持 HEVC 时，适配层请求 `compatible:true`，服务返回既有 `prepare` 模式；原版播放器的 12 秒超时后仍可使用 `server/web-v6/media/demo.mp4` 作为 H.264/AAC fallback：

- 来源：本项目真实下载的《贪恋她》第 1 集；
- 规格：1080×1920、H.264/AAC、100.100998 秒；
- 用途：保证原版播放器可操作、可播放、可拖动；不代表上游取源已恢复，也不代表每集播放的是对应剧集。

同一播放会话允许同时保留预载流与可见流；此前“每个会话只保留一个流”的实现会让原版播放器先创建的流在第二次请求后返回 404。

## 2026-11-25 登录二维码与侧栏修正

- 适配层注入样式，隐藏原版侧栏底部的 `.donate-btn` 与 `.author-sign`，保留反馈和设置入口；不再显示“打赏作者 / 作者: hongguo-player”。
- `QRLoginStart`、`QRLoginPoll`、`QRLoginCancel` 改为调用真实红果网页二维码接口；二维码图片按原版登录页要求返回 base64，状态映射为 waiting、confirmed、expired。
- 新增 `server/web-account.cjs`，复用桌面版已验证的账号状态、Cookie 和二维码流程；Web 端凭据用 `.web-runtime` 本地 AES-256-GCM 密钥保存，`Logout` 清除。
- 本机与公网 `https://hongguo.paws.rodeo/#/login` 均验证二维码为 512×512 且 `naturalWidth > 0`；侧栏两个元素计算样式为 `display:none`，反馈和设置仍显示。
- 登录确认后的资料读取和持久化沿用 `src/native/account-session.js` 的既有实现；短信登录仍是原版占位。

## 验收

- `npm run test:web`：26 项通过；覆盖原版首页、Wails bindings、CSP、hashed asset 缓存、视频 Range/HEAD，以及同会话多播放流。
- 本机 `http://127.0.0.1:3188`：`/api/play` 对《谁让这个文盲修仙的第七季》第 1 集返回 `mode:stream`、`codec:hevc`、89.281 秒、16,353,194 字节；Range `0-2047` 返回 206、`video/mp4` 和 `ftypisom` 头。
- 本机浏览器：真实分集 `readyState=4`，时间从 17.896 秒推进到 42.018 秒，拖动后继续播放，无媒体错误。
- 本机切集：点击“下一集”后从第 1 集切到第 2 集，新流 `readyState=4`、95.806 秒并继续推进；第 2 集触发 `ended` 后自动进入第 3 集，新流 `readyState=4`、87.702 秒且无错误。
- 公网 `https://hongguo.paws.rodeo`：同一分集接口返回 `mode:stream`、`codec:hevc`、89.281 秒；浏览器时间从 2.991 秒推进到 4.023 秒，无媒体错误。
- 旧发布目录备份在 `.web-runtime/public-before-v6-20261123/`。

## 限制

- 原版首次使用引导仍会出现，属于 App 原始行为。
- 消息、下载等依赖 Wails 原生客户端的模块没有对应后端，保留原版空状态或本地占位，不伪造服务端数据；扫码登录已接通，短信登录仍为占位。
- `hg-resolve` 二进制当前只提供 macOS arm64；其他平台仍回退旧 `web-v2` 取流。浏览器不支持 HEVC 时仍使用既有兼容回退。
- 真实上游仍可能临时空响应或更换设备资格；失败时会记录 `hg-resolve` stderr，不以演示片冒充上游取流成功。
- 公网入口依赖 Mac mini 上当前 Node 进程，尚未改为开机自启。
