<p align="center">
  <img src="build/icon.png" alt="红果短剧 Web 播放器" width="112" height="112">
</p>

<h1 align="center">红果短剧 Web 播放器</h1>

<p align="center">原版 App 前端，真实片源，浏览器直接看。</p>

<p align="center">
  <a href="https://hongguo.paws.rodeo/"><img alt="在线播放" src="https://img.shields.io/badge/%E5%9C%A8%E7%BA%BF%E6%92%AD%E6%94%BE-hongguo.paws.rodeo-c0392b?style=flat-square"></a>
  <img alt="Node.js 22.12+" src="https://img.shields.io/badge/Node.js-22.12%2B-339933?style=flat-square">
  <a href="LICENSE"><img alt="GPL-3.0" src="https://img.shields.io/badge/license-GPL--3.0-555555?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://hongguo.paws.rodeo/"><strong>打开播放器</strong></a> ·
  <a href="#本地运行">本地运行</a> ·
  <a href="#实现结构">实现结构</a> ·
  <a href="docs/web-v6.md">Web V6 记录</a>
</p>

## 这是什么

把红果桌面 App 1.2.31 的原版 Wails 前端直接放到浏览器里运行，并在前端与现有 REST 服务之间加了一层适配器。页面、路由、样式和播放器沿用原版，目录与片源使用真实接口。

在线入口：<https://hongguo.paws.rodeo/>

## 已实现

- 推荐、搜索、排行、新剧、剧集详情与演员作品，读取真实红果目录。
- 单集取流使用官方桌面版取流模型，解析真实 CDN、清晰度、编码和 CENC key。
- HEVC 流式播放、Range 拖动、切集、自动连播和续播。
- 原版扫码登录已接真实红果网页二维码，登录状态由服务端加密保存。
- 收藏、点赞、历史、预约与追更保存在当前浏览器。
- 公开浏览；下载、任务和已下载文件仅本人管理身份可访问。
- 上游取流失败时保留明确的兼容回退，不用演示片冒充对应剧集。

## 本地运行

需要 Node.js >= 22.12，macOS arm64 可直接使用仓库内的 `hg-resolve`。

```bash
npm install --omit=dev --ignore-scripts
npm run start:web
```

打开 <http://127.0.0.1:3188>。运行数据与访问令牌保存在 `.web-runtime/`，不会提交到 Git。

```bash
cat .web-runtime/access-token   # 本人管理令牌
node server/owner-login.cjs     # 生成 15 分钟一次性管理入口
npm run test:web                # Web 定向测试
```

可用 `PORT`、`HOST`、`DATA_DIR`、`DOWNLOAD_DIR`、`HONGGUO_TOKEN` 覆盖默认配置。

## 实现结构

```text
server/web-v6/          原版 Wails 前端与 REST 适配层
server/public/          正式发布副本
server/hg-resolve.cjs   长驻取流侧车调用
server/native/          取流二进制与 MetaSec 签名材料
server/online.cjs       真实片源解析与回退
server/range-media.cjs  CENC 解密与 Range 响应
docs/web-v6.md          结构、接口与验收记录
```

`/api/play` 返回真实时长、大小和分辨率；媒体响应支持 `HEAD`、`Range`、`206/416`。浏览器不支持 HEVC 时走既有兼容准备流程。

## 边界

- `hg-resolve` 当前只提供 macOS arm64，其他平台回退旧 `web-v2` 取流。
- 登录、消息、下载等依赖 Wails 原生客户端的页面保留原版空状态或本地占位，不伪造服务端数据。
- 扫码登录已接通；短信登录仍保留原版占位。
- 上游仍可能临时返回空响应、404 或更换设备资格；失败会明确记录。
- 公网入口目前依赖 Mac mini 上的 Node 进程，尚未改为开机自启。
- 本项目是非官方 Web 客户端，剧集内容与商标归原权利人。

## 上游与许可

基于 [jackotom/hongguo-drama](https://github.com/jackotom/hongguo-drama) 的 Web 分支构建，沿用 GPL-3.0、`NOTICE` 与第三方声明。原版界面资源来自红果桌面 App 1.2.31；取流实现参考 [NeeYoonc/hongguo-web-player](https://github.com/NeeYoonc/hongguo-web-player)，其 Rust 取流库按 PolyForm Noncommercial 1.0.0 使用，许可原文见 `server/licenses/LICENSE.open-player.txt`。

桌面版说明与历史发行记录见 [docs/desktop-readme.md](docs/desktop-readme.md)。
