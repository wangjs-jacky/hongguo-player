# 红果视频站布局改版

## 源信息
参考：https://ani.girigirilove.com/ 。方法：https://github.com/Jane-xiaoer/claude-skill-web-clone （MIT，作者Jane）。原站部署前端React/Vite/Tailwind；未找到可确认归属且可复用的完整源码许可。原站JS/CSS仅存ignored本地资料用于结构观察，不进入红果公开源码或部署。

## 复刻前预判
L3内容前端；模式为内容适配与结构复刻。顶部频道/搜索/主题、精选焦点加右侧发现列表、分类快捷入口、六列海报、详情档案、视频加侧栏选集与手机底部导航均由部署资源确认。原站浏览器地域跳转阻止线上首页观察；只读本地副本用于核对渲染，不冒称原站可访问。用户要求替换现有布局，沿用红果真实数据、鉴权和播放器。

## 边界
不复制原站品牌、动漫海报、评论、用户系统、广告或追踪；不接入其媒体来源。以自己的HTML/CSS/JS实现已观察结构。候选已实际接入；公网结果另见docs/web-v4.md。

## 观察与实现对照
| 模块 | 原站实际部署依据 | 红果实现与取舍 |
|---|---|---|
| 全站导航 | index-DYFTLEqF.js 的Ci/Ti；index-6rpvw7Sa.css | 顶部频道、搜索、外观和手机底栏；频道换为短剧、演员、收藏与下载 |
| 首页 | HomePage-DHPCh_8k.js 的home-featured/discovery-nav；CSS site-container | 精选配发现侧列，三类短剧与四个内容模块；以真实剧名、简介和封面替换 |
| 海报 | MediaGrid-DlN3cG4z.js、CSS media-grid与poster-cue | 桌面6列，手机2/3列；悬停播放提示；不复制动漫图片 |
| 详情 | DetailPage-HDy0N0V-.js 的surface和episode-grid | 独立档案页、主演与系列各季，保留下载选择 |
| 播放 | PlayerPage-CK4Aj7jz.js 的player-layout/watch-sidebar | 视频加右侧选集；自有播放器、弹幕和兼容转换，手机上下排 |

## 评分与边界
为Agent按候选证据作的近似评估，不是用户认可：源证据4/5，结构4/5，视觉3/5，交互4/5，响应式4/5，功能4/5，内容替换5/5。没有声称像素级复制；动漫横幅改为短剧竖海报适配，自动装饰轮播改用户切换，时间表与账号评论没有虚构数据。

## 修改入口
主页面：server/public/index.html；页面与路由行为：server/public/app.js；视觉与断点：server/public/styles.css。server/web-v4保留候选来源。数据与签名仍在server和src/native，主题、收藏与观看键保持。
