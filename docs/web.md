# 独立 Web 端

当前为 Web V6，直接复用红果 App 1.2.31 的原版 Wails 前端；最新实现、验收和限制见 [web-v6.md](web-v6.md)。下文为历史阶段记录。

基于 jackotom/hongguo-drama（本轮起点见 git rev-parse HEAD），保留 GPL-3.0、NOTICE 及第三方声明。本轮新增独立 Web UI，不改桌面 Electron 入口，不进行发行或推送。

## 启动

Node.js >=22.12；安装服务端依赖 `npm install --omit=dev --ignore-scripts`，然后 `npm run start:web`。默认端口3188，可用 PORT/HOST 覆盖。默认监听本机全部接口；仅在可信内网使用，跨公网需另行配置 HTTPS。

默认运行目录 `.web-runtime/` 已加入 Git 忽略。首次启动在其中生成 access-token（权限600），在网页「连接设置」输入该文件内容。数据和下载分别存放于其中 data/ 与 downloads/，独立于桌面应用。可用 DATA_DIR、DOWNLOAD_DIR 和 HONGGUO_TOKEN 覆盖。

Mac 默认使用 /opt/homebrew/bin/ffmpeg、ffprobe；其他环境设置 FFMPEG_PATH、FFPROBE_PATH。ByteVC2 片源还需上游提供的 Librempeg，通过 LIBREMPEG_PATH 配置；标准 FFmpeg 不能代替它。本机本轮没有配置该组件。

## 功能与边界

- 真实公开目录：真人短剧、漫剧、AI短剧、热播榜；关键词搜索及分页。
- 分集目录、单集播放准备、批量选集下载。下载完成后，经本机播放器播放；首次需要等待下载或转换，不是边下边播。
- H.264/AAC兼容准备、原生video controls、Range拖动、下一集及连播。
- 追剧与进度保存在当前浏览器localStorage，不跨浏览器同步。暂停/拖动/关闭及媒体时间变化触发进度保存。
- 下载任务由带Bearer鉴权的fetch事件流推送，无状态轮询；流断开后显示提示，由用户手动刷新或重新连接。
- API使用内存访问令牌；媒体使用HttpOnly、SameSite=Strict的12小时服务端会话，仅授权读取已登记文件，不能替代API令牌。显式断开连接撤销当前媒体会话；服务重启清空所有媒体会话。
- 队列保留既有挂载、来源、身份、完整时长和实际画质校验。来源只提供预览、拒绝访问或CDN跳转不符时明确失败，不放宽白名单。
- 上游 NAS API 的合并能力保留；当前新UI不提供合并选择器、账号登录或第三方来源。

## 本轮验证（2026-11-15）

`npm run test:web`：22项通过。覆盖原后端鉴权/持久化/下载边界，以及新增媒体会话权限隔离、Range/suffix/416、注销撤销、任务变更主动事件推送。夹具只验证协议，未将夹具当播放素材。

Ego真实浏览器：连接服务、24部真实目录、搜索《贪恋她》、读取77集目录、加入追剧、375px无横向溢出已验证；关键截图已报告Happy Skills进度。

随机真实素材《贪恋她》首集下载失败：CDN跳转未通过上游白名单；随后单次取源仅网页预览/App连接失败/旧接口空响应。保留失败结果，不扩展CDN白名单、不使用彩条或样例视频。真实完整下载、静音播放、拖动、连播及ByteVC2尚未验收，不能宣称全部可播。兼容转码分支目前仅实现，未实播验证。

本次启动为独立进程，未注册开机自启，未配置公网域名。

第二部随机素材《都说了，别惹那个乞丐》：网页HTTP404、App超时、旧接口空响应，同样未取得完整片源。最终新版服务通过Tailscale地址读取真实24部目录成功。

方法已写回 codex-harness/experience.local.md；浏览器经验写入 ego-ops/references/sites/hongguo-web/operations/browse-search-favorite.md，并更新站点及总索引验证日期。全库知识校验已执行，现有Paws资料有2项无关错误（敏感材料检测、另一operation索引缺项），本轮未改动这些文件，不宣称全库通过。未使用Cloudflare部署，因此无Cloudflare运行经验可更新。

## 2026-11-15 跨机访问修复

用户在Chrome打开原HTTP私网IP得到ERR_EMPTY_RESPONSE。检查时进程仍在，Mini本机/IP以及Air的直接/显式代理HTTP请求均为200，不能归因为进程退出、Tailscale离线或代理确定故障。Air的Ego实际浏览器访问HTTP MagicDNS入口报ERR_SSL_PROTOCOL_ERROR，具体升级/拦截机制未确认。

已新增独立Tailscale Serve HTTPS端口8447，代理127.0.0.1:3188，保留8444/8445/8446原映射。入口：https://jackymac-mini-1.tailfa00b4.ts.net:8447/ 。私网范围不变，仍需Tailscale；没有新增Cloudflare或公网隧道。

Air HTTPS证书校验请求200，Air真实Ego页面打开、令牌连接与24部真实目录通过；截图已报告本Happy会话Skills。此为跨机Ego验收，不是原Chrome复验或实体手机验收。访问令牌保持原值；原有播放片源限制不因入口修复而解除。

回滚仅本次映射：Tailscale CLI serve --https=8447 off，不使用serve reset，源站和其他映射保留。

## 2026-11-15 公网入口（当前交付地址）

https://hongguo.paws.rodeo/ 是当前主入口，不要求用户设备连接Tailscale。前面的私网入口保留作维护备用，不再作为通用交付地址。用户当前使用其他设备；此前Air私网验证不能替代该设备的访问验收，具体Chrome错误机制未确定。

复用既有mac-ops Cloudflare连接器，只新增hongguo.paws.rodeo→http://127.0.0.1:3188。控制台表单成功创建代理CNAME，读回及与旧配置的对象比较确认原mac-ops路由和其他配置保持；没有新建连接器或运行部署CLI。配置前后快照只在ignored .web-runtime。

外部阿里云服务器通过普通公网HTTPS请求首页200、匿名任务API401；Mini实际Ego浏览器经公网域名完成令牌连接、24部真实目录和SSE实时事件连接。截图已报告Happy Skills。Mini无代理的curl该域名一次20秒连接超时，而浏览器和外部服务器通过；不把所有网络客户端都描述为已验收。外部Python默认UA调用一次403，后续结果另记，不修改WAF。

媒体会话新增仅信任loopback反代X-Forwarded-Proto=https时的Secure标记。22项定向测试重新通过。新增入口未引入业务状态轮询；应用原有单次请求超时及队列调度等待不查询业务状态，事件读取为被动SSE。未全面审计共享连接器服务的其他应用。

源站仍依赖Mac mini在线和当前独立Node进程；尚未配置本服务开机自启。真实剧集取源/播放限制仍沿前述报告。回滚仅移除本次hostname的Tunnel ingress与对应DNS，不重置或删除共享隧道。

公网外部补验：明确关闭环境代理并使用浏览器UA后，status200、catalog200、会话创建200且带Secure、异源写请求403、logout200。默认Python UA的403发生在边缘请求条件差异中，未确定更细原因；未改变WAF。
