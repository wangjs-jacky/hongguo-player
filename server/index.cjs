// Hongguo Drama 8.1: server entry.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Storage, fail, safeError, assertFields, numericId } = require('./storage.cjs');
const defaultMedia = require('./media.cjs');
const { search: searchHongguo } = require('./search.cjs');
const PUBLIC = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
const PUBLIC_ROOT = path.resolve(PUBLIC);
const PUBLIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function makeTask(fields) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), ...fields, status: 'queued', progress: 0, createdAt: now, updatedAt: now };
}
function pausesDownloads(error) {
  if ([403, 429].includes(Number(error?.response?.status))) return true;
  return ['BUSINESS_REJECTED', 'DEVICE_REGISTRATION_FAILED'].includes(error?.code)
    || error?.code === 'SOURCE_UNAVAILABLE' && error.sources?.some(item => item.source === 'app' && /^(?:BUSINESS_REJECTED|DEVICE_REGISTRATION_FAILED|HTTP_(?:403|429))$/.test(item.code));
}
async function body(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw fail('请求必须使用 application/json', 415);
  let bytes = 0, chunks = [];
  for await (const chunk of request) { bytes += chunk.length; if (bytes > 65536) throw fail('请求过大', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('JSON 格式无效'); }
}
function actorRequest() {
  const deadline = Date.now() + 8000;
  return (signed, requested) => require('../src/native/app-source').requestJson(signed.url,
    {...require('../src/native/web-media-guard').webMediaRequestOptions(signed.url),proxy:false,method:'GET',headers:signed.headers,preserveLargeIntegerFields:['celebrity_id','actor_id','user_id','series_id']}, Math.min(requested,deadline));
}
function createApp({ token, dataRoot, downloadRoot, media = defaultMedia, search = searchHongguo, autoStart = true, openAccess = false, ownerAuthPath }) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || /\s/.test(token)) throw fail('必须配置 32 至 256 字符的 HONGGUO_TOKEN，不得含空白');
  const digest = crypto.createHash('sha256').update(`Bearer ${token}`).digest();
  const store = new Storage(dataRoot, downloadRoot);
  const {createOwnerAuth,OWNER_AGE}=require('./owner-access.cjs');
  const ownerAuth=createOwnerAuth(ownerAuthPath);
  const subscribers = new Set(), sessions = new Map(), streams = new Map();
  const closeRevokedSubscribers=()=>{for(const res of subscribers)if(res.ownerCookie&&!ownerAuth.authorized(res.ownerCookie)){subscribers.delete(res);res.end();}};
  const publish = () => { closeRevokedSubscribers();const event = `data: ${JSON.stringify({tasks: store.tasks.map(t => store.publicTask(t)).reverse()})}\n\n`; for (const res of subscribers) { try { if (!res.write(event)) { subscribers.delete(res); res.end(); } } catch { subscribers.delete(res); } } };
  const save = store.save.bind(store);
  store.save = () => { save(); publish(); };

  let prefetching = 0, resettingDevice = false;
  let active, stopped = false, reading = 0, shuttingDown, nextDownloadAt = 0, downloadTimer;
  const controllerById = new Map();
  const authorized = request => crypto.timingSafeEqual(digest, crypto.createHash('sha256').update(String(request.headers.authorization || '')).digest());
  function drain() {
    if (active || stopped) return;
    try { store.checkRoot(); } catch (error) {
      if (error.code !== 'MOUNT_CHANGED') return;
      try { store.interruptQueued('下载挂载已变化，已暂停剩余任务；请恢复原挂载后手动重试'); } catch { stopped = true; }
      return;
    }
    const task = store.tasks.find(item => item.status === 'queued');
    if (!task) return;
    if (task.type === 'download' && nextDownloadAt > Date.now()) {
      clearTimeout(downloadTimer);
      downloadTimer = setTimeout(drain, nextDownloadAt - Date.now());
      return;
    }
    const controller = new AbortController();
    controllerById.set(task.id, controller);
    try { store.update(task, { status: 'running', error: '', progress: 0 }); } catch { stopped = true; return; }
    let lastUpdate = 0, storageFailed = false;
    const update = progress => {
      if (task.status !== 'running' || Date.now() - lastUpdate < 1000 || storageFailed) return;
      lastUpdate = Date.now();
      try { store.update(task, { progress }); } catch { storageFailed = true; stopped = true; controller.abort(); }
    };
    active = (async () => {
      try {
        await media[task.type](task, store, controller.signal, update);
        if (task.status === 'running' && !storageFailed) store.complete(task);
      } catch (error) {
        if (task.status === 'running' && !storageFailed) store.update(task, { status: 'failed', error: safeError(error) });
        if (!storageFailed && error.code === 'MOUNT_CHANGED') store.interruptQueued('下载挂载已变化，已暂停剩余任务；请恢复原挂载后手动重试');
        else if (!storageFailed && pausesDownloads(error)) store.interruptQueued('来源拒绝请求，已暂停队列；请稍后手动重试');
      } finally {
        if (task.type === 'download') nextDownloadAt = Date.now() + 1000;
        controllerById.delete(task.id); active = null; if (!stopped) setImmediate(drain);
      }
    })().catch(() => { stopped = true; });
  }
  const server = http.createServer(async (request, response) => {
    const started = performance.now();
    const send = (status, value) => { response.setHeader('Server-Timing', `app;dur=${(performance.now()-started).toFixed(1)}`); if (!response.headersSent) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(value)); } };
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; media-src 'self' blob: https:; worker-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/health' && request.method === 'GET') return send(stopped ? 503 : 200, { status: stopped ? 'stopping' : 'ok' });
      if (!url.pathname.startsWith('/api/')) {
        if (!['GET', 'HEAD'].includes(request.method)) throw fail('方法不允许', 405);
        const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
        let file = path.resolve(PUBLIC_ROOT, `.${requested}`);
        if (file !== PUBLIC_ROOT && !file.startsWith(PUBLIC_ROOT + path.sep)) throw fail('页面不存在', 404);
        let stat;
        try { stat = fs.statSync(file); } catch {}
        if (!stat?.isFile()) {
          if (path.extname(requested)) throw fail('页面不存在', 404);
          file = path.join(PUBLIC_ROOT, 'index.html');
          stat = fs.statSync(file);
        }
        response.setHeader('Content-Type', PUBLIC_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
        response.setHeader('Cache-Control', requested.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
        response.setHeader('Accept-Ranges', 'bytes');
        let start = 0, end = stat.size - 1, status = 200;
        if (request.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
          if (!match || (!match[1] && !match[2])) {
            response.setHeader('Content-Range', `bytes */${stat.size}`);
            response.writeHead(416);
            return response.end();
          }
          start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
          end = match[2] && match[1] ? Math.min(stat.size - 1, Number(match[2])) : stat.size - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
            response.setHeader('Content-Range', `bytes */${stat.size}`);
            response.writeHead(416);
            return response.end();
          }
          status = 206;
          response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        } else if (request.method === 'HEAD') {
          end = stat.size ? stat.size - 1 : 0;
        }
        response.setHeader('Content-Length', stat.size ? end - start + 1 : 0);
        response.writeHead(status);
        if (request.method === 'HEAD') return response.end();
        return fs.createReadStream(file, { start, end }).pipe(response);
      }
      const sessionKey = /(?:^|; )hg_media=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
      for (const [key, expires] of sessions) if (expires < Date.now()) sessions.delete(key);
      const mediaSession = ['GET','HEAD','DELETE'].includes(request.method) && /^\/api\/(?:files|stream)\/[a-f0-9-]{36}$/.test(url.pathname) && sessions.has(sessionKey);
      if (stopped) throw fail('服务正在停止或持久化失败，请检查存储后重启', 503);
      if (request.headers.origin) {
        let origin; try { origin = new URL(request.headers.origin); } catch { throw fail('来源无效', 403); }
        if (origin.host !== request.headers.host || !['http:', 'https:'].includes(origin.protocol)) throw fail('只允许同源请求', 403);
      }
      const route = url.pathname;
      if(request.headers['sec-fetch-site']==='cross-site')throw fail('只允许同源请求',403);
      const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
      const secure=loopback&&request.headers['x-forwarded-proto']==='https';
      const owner=authorized(request)||ownerAuth.authorized(request.headers.cookie);
      if(request.method==='POST'&&route==='/api/owner/login'){
        const payload=await body(request);assertFields(payload,['code']);
        const value=ownerAuth.exchange(payload.code);if(!value)throw fail('管理授权已失效，请使用新的本人授权入口',401);
        response.setHeader('Set-Cookie',`hg_owner=${value}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${OWNER_AGE}${secure?'; Secure':''}`);
        return send(200,{success:true,owner:true});
      }
      const publicRead=request.method==='GET'&&(/^\/api\/(?:status|catalog|search|actors|source)$/.test(route)||/^\/api\/(?:series|actors|seasons|danmaku)\/\d{1,30}$/.test(route)||/^\/api\/actors\/\d{1,30}\/works$/.test(route));
      const publicPlayback=(request.method==='POST'&&['/api/session','/api/play','/api/prefetch','/api/logout'].includes(route))||(['GET','HEAD','DELETE'].includes(request.method)&&/^\/api\/stream\/[a-f0-9-]{36}$/.test(route));
      if(!owner&&!(openAccess&&(publicRead||publicPlayback))&&!(!openAccess&&mediaSession))throw fail('此功能仅限本人管理，请先使用本人授权入口登录',401);
      if (request.method === 'POST' && route === '/api/logout') {
        ownerAuth.revoke(request.headers.cookie);
        closeRevokedSubscribers();
        if (sessionKey) sessions.delete(sessionKey);
        for (const [id,entry]of streams)if(entry.owner===sessionKey){for(const c of entry.controllers||[])c.abort();streams.delete(id);}
        response.setHeader('Set-Cookie', ['hg_media=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0',`hg_owner=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${secure?'; Secure':''}`]);
        return send(200, {success:true});
      }
      if (request.method === 'POST' && route === '/api/session') {
        if (sessions.size > 128) sessions.delete(sessions.keys().next().value);
        if (sessionKey && sessions.has(sessionKey)) return send(200,{success:true});
        const key = crypto.randomBytes(32).toString('hex'); sessions.set(key, Date.now() + 12 * 3600000);
        const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress);
        const secure = loopback && request.headers['x-forwarded-proto'] === 'https';
        response.setHeader('Set-Cookie', `hg_media=${key}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=43200${secure ? '; Secure' : ''}`);
        return send(200, {success:true});
      }
      if (request.method === 'GET' && route === '/api/events') {
        if(!authorized(request))response.ownerCookie=request.headers.cookie;
        const deadline=setTimeout(()=>{subscribers.delete(response);response.end();},3600000);
        response.once('close',()=>clearTimeout(deadline));
        response.writeHead(200, {'Content-Type':'text/event-stream', 'Connection':'keep-alive', 'X-Accel-Buffering':'no'});
        subscribers.add(response); response.write(`data: ${JSON.stringify({tasks:store.tasks.map(t => store.publicTask(t)).reverse()})}\n\n`);
        request.on('close', () => subscribers.delete(response)); return;
      }
      if (request.method === 'GET' && route === '/api/catalog') {
        if (reading >= 6) throw fail('上游查询繁忙，请稍后重试', 429);
        reading++;
        try { const data = await require('./discovery.cjs').catalog({genre:url.searchParams.get('genre') || '',category:url.searchParams.get('category') || 'real-drama', page:Math.min(50, Math.max(1, Number(url.searchParams.get('page')) || 1))}); return send(data.success ? 200 : 502, data); } finally { reading--; }
      }
      const streamRoute = /^\/api\/stream\/([a-f0-9-]{36})$/.exec(route);
      for (const [id, entry] of streams) if (entry.expires < Date.now() || !sessions.has(entry.owner)) { for(const c of entry.controllers||[])c.abort(); streams.delete(id); }
      if (streamRoute) {
        const entry = streams.get(streamRoute[1]);
        if (!entry || entry.owner !== sessionKey) throw fail('播放会话已过期，请重新选择分集', 404);
        if (request.method === 'DELETE') { for(const c of entry.controllers||[])c.abort(); streams.delete(streamRoute[1]); return send(200,{success:true}); }
        if (!['GET','HEAD'].includes(request.method)) throw fail('方法不允许',405);
        const size=entry.plan.size; let start=0,end=size-1,partial=false;
        if (request.headers.range) {
          const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
          if (!match || (!match[1]&&!match[2])) { response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end(); }
          start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
          end=match[1]&&match[2]?Math.min(size-1,Number(match[2])):size-1;
          if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){response.writeHead(416,{'Content-Range':`bytes */${size}`});return response.end();} partial=true;
        }
        entry.expires=Date.now()+30*60000;
        response.setHeader('Content-Type','video/mp4');response.setHeader('Accept-Ranges','bytes');response.setHeader('Content-Length',end-start+1);
        if(partial)response.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
        if(request.method==='HEAD'){response.writeHead(partial?206:200);return response.end();}
        const controller=new AbortController();entry.controllers ||= new Set();entry.controllers.add(controller);response.once('close',()=>{controller.abort();entry.controllers.delete(controller);});
        const {Readable}=require('node:stream');const {pipeline}=require('node:stream/promises');
        response.writeHead(partial?206:200);
        try {await pipeline(Readable.from(entry.plan.read(start,end,controller.signal)),response,{signal:controller.signal});}catch{response.destroy();} return;
      }
      if (request.method === 'POST' && route === '/api/play') {
        if (!sessionKey || !sessions.has(sessionKey)) throw fail('请先建立播放会话',401);
        const payload=await body(request);assertFields(payload,['seriesId','vid','quality','compatible']);numericId(payload.seriesId);numericId(payload.vid);
        if (reading >= 6) throw fail('当前查询繁忙，请稍后重试',429);
        reading++;const controller=new AbortController();response.once('close',()=>controller.abort());
        try {
          const detail=await media.series(payload.seriesId);if(!detail.episodes.some(e=>e.vid===payload.vid))throw fail('分集不属于本剧');
          const online=require('./online.cjs'); const info=await online.source(payload.vid,payload.quality||'auto',controller.signal,payload.seriesId);
          if (info.codec==='bytevc2' || payload.compatible===true && !['h264','avc','avc1'].includes(info.codec)) return send(200,{success:true,mode:'prepare',codec:info.codec});
          const prepared=await online.prepare(payload.vid,payload.quality||'auto',controller.signal,payload.seriesId);
          if(!prepared.plan)return send(200,{success:true,mode:'prepare',codec:prepared.codec});
          // The original player can open a prefetch stream alongside the
          // visible one, so keep all fresh plans for the same session.
          while(streams.size>=16)streams.delete(streams.keys().next().value);
          const id=crypto.randomUUID();streams.set(id,{...prepared,owner:sessionKey,expires:Date.now()+30*60000});
          return send(200,{success:true,mode:'stream',url:`/api/stream/${id}`,codec:prepared.codec,duration:prepared.duration,size:prepared.plan.size,width:prepared.width,height:prepared.height});
        }finally{reading--;}
      }
      if (request.method === 'GET' && route === '/api/actors') {
        const page = Math.min(20, Math.max(1, Number(url.searchParams.get('page')) || 1));
        const gender = url.searchParams.get('gender') || 'all';
        if (!['all','male','female'].includes(gender)) throw fail('性别筛选无效');
        return send(200, await require('./query-cache.cjs').memo(`actors:${gender}:${page}`,300000,
          () => require('./actors.cjs').fetchActorRankings({page,gender,request:actorRequest()})));
      }
      const actorRoute = /^\/api\/actors\/(\d{1,30})(?:\/(works))?$/.exec(route);
      if (request.method === 'GET' && actorRoute) {
        const actors = require('./actors.cjs'), id = actorRoute[1];
        const offset = Math.min(1000, Math.max(0, Number(url.searchParams.get('offset')) || 0));
        return send(200, await require('./query-cache.cjs').memo(`actor:${id}:${actorRoute[2] || 'detail'}:${offset}`,300000,
          () => actorRoute[2] ? actors.fetchActorWorks(id,{offset,request:actorRequest()}) : actors.fetchActorDetail(id,{request:actorRequest()})));
      }
      const seasonsRoute = /^\/api\/seasons\/(\d{1,30})$/.exec(route);
      if (request.method === 'GET' && seasonsRoute) return send(200, await require('./discovery.cjs').seasons(await media.series(seasonsRoute[1])));
      const danmakuRoute = /^\/api\/danmaku\/(\d{1,30})\/(\d{1,30})$/.exec(route);
      if (request.method === 'GET' && danmakuRoute) {
        const detail = await media.series(danmakuRoute[1]);
        if (!detail.episodes.some(e => e.vid === danmakuRoute[2])) throw fail('分集不属于本剧');
        const c = new AbortController(), timer = setTimeout(() => c.abort(),10000);
        response.once('close',()=>c.abort());
        try { const data = await require('../src/native/danmaku').fetchDanmaku({seriesId:danmakuRoute[1],vid:danmakuRoute[2],signal:c.signal,limit:1500,transport:(url,body,options)=>require('axios').post(url,body,{...require('../src/native/web-media-guard').webMediaRequestOptions(url),...options,proxy:false})}); return send(200,data); }
        finally { clearTimeout(timer); }
      }
      if (request.method === 'POST' && route === '/api/prefetch') {
        const p = await body(request); assertFields(p,['seriesId','vid','quality']);numericId(p.seriesId);numericId(p.vid);
        const detail = await media.series(p.seriesId);
        if (!detail.episodes.some(e=>e.vid === p.vid)) throw fail('分集不属于本剧');
        if (prefetching >= 2) throw fail('预载繁忙',429);
        prefetching++; const c = new AbortController(), t = setTimeout(()=>c.abort(),10000);
        response.once('close',()=>c.abort());
        try { await require('./online.cjs').prepare(p.vid,p.quality || 'auto',c.signal,p.seriesId);return send(200,{success:true}); }
        finally { clearTimeout(t);prefetching--; }
      }
      if (request.method === 'POST' && route === '/api/device/reset') {
        assertFields(await body(request),[]);
        if(resettingDevice)throw fail('正在注册设备，请稍后重试',409);
        resettingDevice=true;
        try { const data = await require('../src/native/app-source').resetWebPlaybackDevice();
          require('./online.cjs').clear();require('../src/native/danmaku').resetDanmakuCache();
          return send(200,{success:true,...data});
        } finally { resettingDevice=false; }
      }
      if (request.method === 'GET' && route === '/api/status') return send(200, { success: true, version: require('../package.json').version, webVersion: '6.0', openAccess, owner, sdk: 'hongguo-drama native / open-player adaptations', ...(owner?{downloadRoot:'/downloads',concurrency:1}:{}) });
      if (request.method === 'GET' && route === '/api/source') {
        const file=path.join(__dirname,'../.web-runtime/web-source.tar.gz');
        if(!fs.existsSync(file))throw fail('源码包暂未生成',503);
        response.setHeader('Content-Type','application/gzip');response.setHeader('Content-Disposition','attachment; filename=hongguo-web-source.tar.gz');
        return fs.createReadStream(file).pipe(response);
      }
      if (request.method === 'GET' && route === '/api/tasks') {
        store.checkRoot(); store.reconcileCompleted();
        return send(200, { success: true, tasks: store.tasks.map(task => store.publicTask(task)).reverse() });
      }
      if (request.method === 'GET' && (route === '/api/search' || /^\/api\/series\/[^/]+$/.test(route))) {
        if (reading >= 6) throw fail('上游查询繁忙，请稍后重试', 429);
        reading++;
        try {
          if (route === '/api/search') {
            const q = (url.searchParams.get('q') || '').trim(), page = Number(url.searchParams.get('page') || 1);
            if (!q || q.length > 200 || !Number.isInteger(page) || page < 1 || page > 50) throw fail('搜索词或页码无效');
            const result = await search(q, { page, retries: 1, deadline: Date.now() + 20000 });
            const results = (result.results || []).filter(item => /^\d{1,30}$/.test(String(item.series_id))).map(item => ({ series_id: String(item.series_id), series_title: String(item.series_title || ''), cover: String(item.cover || ''), total: item.total || item.episode_count, tags: item.tags || [], description: item.description || '', social_info: item.social_info || null }));
            return send(200, { success: true, results, page, hasMore: result.hasMore === true || result.has_more === true });
          }
          return send(200, { success: true, series: await media.series(numericId(route.split('/').pop())) });
        } finally { reading--; }
      }
      const fileRoute = /^\/api\/files\/([a-f0-9-]{36})$/.exec(route);
      if (fileRoute && request.method === 'GET') {
        const task = store.get(fileRoute[1]); if (task.status !== 'completed') throw fail('文件尚未完成', 409);
        const file = store.artifact(task).file, fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW), stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size < 1) { fs.closeSync(fd); throw fail('文件不可用', 409, 'ARTIFACT_INVALID'); }
        let start = 0, end = stat.size - 1, status = 200;
        const range = request.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) { fs.closeSync(fd); response.writeHead(416, {'Content-Range':`bytes */${stat.size}`}); return response.end(); }
          if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { fs.closeSync(fd); response.writeHead(416, {'Content-Range':`bytes */${stat.size}`}); return response.end(); }
          status = 206; response.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
        }
        response.setHeader('Content-Type', 'video/mp4'); response.setHeader('Content-Length', end-start+1);
        response.setHeader('Accept-Ranges', 'bytes'); response.setHeader('Content-Disposition', `inline; filename="${task.id}.mp4"`);
        response.writeHead(status);
        const stream = fs.createReadStream(file, { fd, autoClose: true, start, end });
        response.once('close', () => stream.destroy()); stream.on('error', () => response.destroy()); return stream.pipe(response);
      }
      if (request.method !== 'POST') throw fail('接口不存在', 404);
      const payload = await body(request);
      if (route === '/api/downloads') {
        assertFields(payload, ['seriesId', 'episodeIds', 'quality']); numericId(payload.seriesId);
        store.checkRoot();
        if (!Array.isArray(payload.episodeIds) || !payload.episodeIds.length || payload.episodeIds.length > 1000 || payload.episodeIds.some(id => typeof id !== 'string' || !/^\d{1,30}$/.test(id)) || new Set(payload.episodeIds).size !== payload.episodeIds.length) throw fail('请选择有效且不重复的分集');
        const quality = payload.quality || 'auto'; if (!['auto', '720p', '1080p'].includes(quality)) throw fail('画质无效');
        if (reading >= 6) throw fail('上游查询繁忙，请稍后重试', 429);
        let detail; reading++; try { detail = await media.series(payload.seriesId); } finally { reading--; }
        const selected = detail.episodes.filter(item => payload.episodeIds.includes(item.vid));
        if (selected.length !== payload.episodeIds.length) throw fail('选择包含不属于本剧的分集');
        // Resolve duplicates after the awaited catalogue so concurrent submissions remain idempotent.
        const tasks = [], added = [];
        for (const episode of selected) {
          let existing = store.tasks.find(item => item.type === 'download' && item.seriesId === payload.seriesId && item.vid === episode.vid && item.quality === quality && ['queued', 'running', 'completed'].includes(item.status));
          if (existing?.status === 'completed') {
            try { store.artifact(existing); } catch (error) {
              if (error.code !== 'ARTIFACT_INVALID') throw error;
              store.quarantineArtifact(existing);
              store.update(existing, { status: 'queued', progress: 0, error: '', artifact: null });
            }
          }
          const task = existing || makeTask({ type: 'download', seriesId: detail.series_id, seriesTitle: detail.series_title, vid: episode.vid, episodeIndex: episode.vid_index, episodeTitle: episode.title, quality });
          tasks.push(task); if (!existing) added.push(task);
        }
        if (added.length) store.add(added);
        send(202, { success: true, tasks: tasks.map(task => store.publicTask(task)) }); if (autoStart) drain(); return;
      }
      if (route === '/api/merge') {
        assertFields(payload, ['taskIds']);
        if (!Array.isArray(payload.taskIds) || payload.taskIds.length < 2 || payload.taskIds.length > 1000 || new Set(payload.taskIds).size !== payload.taskIds.length) throw fail('请至少选择两个不同的已完成分集');
        const inputs = payload.taskIds.map(id => store.get(id)).sort((a, b) => a.episodeIndex - b.episodeIndex), first = inputs[0];
        if (inputs.some(input => input.type !== 'download' || input.status !== 'completed' || input.seriesId !== first.seriesId) || new Set(inputs.map(input => input.episodeIndex)).size !== inputs.length) throw fail('只允许同剧且集号不重复的已完成分集合并');
        for (const input of inputs) {
          try { store.artifact(input); } catch (error) {
            if (error.code === 'MOUNT_CHANGED') throw error;
            if (error.code === 'ARTIFACT_INVALID') throw fail('分集文件不可用，请重新下载', 409, 'ARTIFACT_INVALID');
            throw error;
          }
        }
        const task = makeTask({ type: 'merge', seriesId: first.seriesId, seriesTitle: first.seriesTitle, taskIds: inputs.map(input => input.id) });
        store.add([task]); send(202, { success: true, task: store.publicTask(task) }); if (autoStart) drain(); return;
      }
      const action = /^\/api\/tasks\/([a-f0-9-]{36})\/(retry|cancel)$/.exec(route);
      if (action) {
        assertFields(payload, []); const task = store.get(action[1]);
        if (action[2] === 'retry') {
          if (!['failed', 'cancelled', 'interrupted'].includes(task.status) || controllerById.has(task.id)) throw fail('当前任务不能重试，请等待停止完成', 409);
          if (task.type === 'download' && store.tasks.some(other => other.id !== task.id && other.type === 'download' && other.seriesId === task.seriesId && other.vid === task.vid && other.quality === task.quality && ['queued', 'running', 'completed'].includes(other.status))) throw fail('同集同画质已有有效任务，请使用现有任务', 409);
          store.update(task, { status: 'queued', progress: 0, error: '' });
        } else {
          if (!['queued', 'running'].includes(task.status)) throw fail('当前任务不能取消', 409);
          store.update(task, { status: 'cancelled', error: '已取消；已完成文件保留' }); controllerById.get(task.id)?.abort();
        }
        send(200, { success: true, task: store.publicTask(task) }); if (autoStart) drain(); return;
      }
      throw fail('接口不存在', 404);
    } catch (error) {
      if (error.code === 'MOUNT_CHANGED') {
        try { store.interruptQueued('下载挂载已变化，已暂停剩余任务；请恢复原挂载后手动重试'); } catch { stopped = true; }
        return send(409, { success: false, code: 'MOUNT_CHANGED', error: safeError(error) });
      }
      send(error.status || 500, { success: false, error: safeError(error) });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 15000; server.maxConnections = 64;
  if (autoStart) setImmediate(drain);
  async function close() {
    if (shuttingDown) return shuttingDown;
    stopped = true;
    for (const res of subscribers) res.end(); subscribers.clear(); sessions.clear();for(const entry of streams.values())for(const c of entry.controllers||[])c.abort();streams.clear();
    clearTimeout(downloadTimer);
    shuttingDown = (async () => {
      try {
        for (const task of store.tasks.filter(item => item.status === 'running')) store.update(task, { status: 'interrupted', error: '服务已停止，请手动重试' });
      } catch {} finally { for (const controller of controllerById.values()) controller.abort(); }
      const closed = new Promise(resolve => server.listening ? server.close(resolve) : resolve());
      server.closeIdleConnections();
      await active; await closed;
    })();
    return shuttingDown;
  }
  return { server, store, close, drain };
}
if (require.main === module) {
  try {
    const app = createApp({ token: process.env.HONGGUO_TOKEN, dataRoot: process.env.DATA_DIR || '/data', downloadRoot: process.env.DOWNLOAD_DIR || '/downloads' });
    const port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail('端口无效');
    app.server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`Hongguo Web listening on port ${port}`));
    app.server.on('error', error => { console.error(`服务启动失败：${error.code || '未知'}`); process.exit(1); });
    for (const event of ['SIGTERM', 'SIGINT']) process.once(event, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
  } catch (error) { console.error(safeError(error)); process.exitCode = 1; }
}
module.exports = { createApp, makeTask };
