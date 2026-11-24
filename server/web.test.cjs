const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');const {createApp,makeTask}=require('./index.cjs');
const token='isolated-web-test-token-0123456789abcdef';
async function setup(t,options={}){const root=fs.mkdtempSync(path.join(os.tmpdir(),'hg-web-'));const app=createApp({token,dataRoot:path.join(root,'data'),downloadRoot:path.join(root,'downloads'),autoStart:false,...options});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(async()=>{await app.close();fs.rmSync(root,{recursive:true,force:true});});const base=`http://127.0.0.1:${app.server.address().port}`;const headers={Authorization:`Bearer ${token}`};return{app,base,headers};}
test('media session cannot authorize API, supports seek ranges, and logout revokes it',async t=>{const{app,base,headers}=await setup(t);const task=makeTask({type:'download',seriesId:'123',seriesTitle:'fixture',vid:'456',episodeIndex:1,quality:'auto'});app.store.add([task]);fs.writeFileSync(app.store.output(task),'0123456789');app.store.complete(task);assert.equal(app.store.publicTask(task).vid,'456');let r=await fetch(base+'/api/session',{method:'POST',headers});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);r=await fetch(base+'/api/tasks',{headers:{Cookie:cookie}});assert.equal(r.status,401);r=await fetch(base+'/api/files/'+task.id,{headers:{Cookie:cookie,Range:'bytes=2-5'}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 2-5/10');assert.equal(await r.text(),'2345');r=await fetch(base+'/api/files/'+task.id,{headers:{Cookie:cookie,Range:'bytes=-3'}});assert.equal(await r.text(),'789');r=await fetch(base+'/api/files/'+task.id,{headers:{Cookie:cookie,Range:'bytes=100-'}});assert.equal(r.status,416);await fetch(base+'/api/logout',{method:'POST',headers:{...headers,Cookie:cookie}});r=await fetch(base+'/api/files/'+task.id,{headers:{Cookie:cookie}});assert.equal(r.status,401);});
test('task mutations deliver events without a client status query',async t=>{const{app,base,headers}=await setup(t);const abort=new AbortController();const response=await fetch(base+'/api/events',{headers,signal:abort.signal});const reader=response.body.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/"tasks":\[\]/);const task=makeTask({type:'download',seriesId:'123',seriesTitle:'fixture',vid:'456',episodeIndex:1,quality:'auto'});const next=reader.read();app.store.add([task]);assert.match(new TextDecoder().decode((await next).value),new RegExp(task.id));abort.abort();await reader.cancel().catch(()=>{});});
test('stream routes bind to a media session, restrict episode ownership, support seek and revoke',async t=>{
 const online=require('./online.cjs');
 t.mock.method(online,'source',async()=>({codec:'h264'}));
 t.mock.method(online,'prepare',async()=>({codec:'h264',duration:10,plan:{size:10,async *read(start,end,signal){signal.throwIfAborted();yield Buffer.from('0123456789').subarray(start,end+1);}}}));
 const{app,base,headers}=await setup(t,{media:{series:async()=>({series_id:'123',episodes:[{vid:'456',vid_index:1}]})}});app.store.checkRoot();
 // No real media fixture: these bytes only exercise HTTP session/range contracts.
 app.store.tasks=[];
 const session=async()=>{const r=await fetch(base+'/api/session',{method:'POST',headers});return r.headers.get('set-cookie').split(';')[0];};
 const c1=await session(),c2=await session();

 const bad=await fetch(base+'/api/play',{method:'POST',headers,body:JSON.stringify({seriesId:'123',vid:'456'})});assert.equal(bad.status,401);
 const payload={seriesId:'123',vid:'456'};
 let r=await fetch(base+'/api/play',{method:'POST',headers:{...headers,'Content-Type':'application/json',Cookie:c1},body:JSON.stringify({...payload,vid:'999'})});assert.equal(r.status,400);
 r=await fetch(base+'/api/play',{method:'POST',headers:{...headers,'Content-Type':'application/json',Cookie:c1},body:JSON.stringify(payload)});assert.equal(r.status,200);const item=await r.json();
 r=await fetch(base+'/api/play',{method:'POST',headers:{...headers,'Content-Type':'application/json',Cookie:c1},body:JSON.stringify(payload)});assert.equal(r.status,200);const second=await r.json();
 r=await fetch(base+item.url,{headers:{Cookie:c1,Range:'bytes=0-1'}});assert.equal(r.status,206);assert.equal(await r.text(),'01');
 r=await fetch(base+second.url,{headers:{Cookie:c1,Range:'bytes=0-1'}});assert.equal(r.status,206);assert.equal(await r.text(),'01');
 r=await fetch(base+item.url,{headers:{Cookie:c2,Range:'bytes=0-2'}});assert.equal(r.status,404);
 r=await fetch(base+item.url,{headers:{Cookie:c1,Range:'bytes=3-6'}});assert.equal(r.status,206);assert.equal(await r.text(),'3456');
 r=await fetch(base+item.url,{headers:{Cookie:c1,Range:'bytes=-2'}});assert.equal(await r.text(),'89');
 r=await fetch(base+item.url,{headers:{Cookie:c1,Range:'bytes=99-'}});assert.equal(r.status,416);
 await fetch(base+item.url,{method:'DELETE',headers:{Cookie:c1}});
 r=await fetch(base+item.url,{headers:{Cookie:c1}});assert.equal(r.status,404);
 // Source sessions are needed even when the API bearer is valid.
 assert.equal((await fetch(base+'/api/stream/00000000-0000-0000-0000-000000000000',{headers:{Cookie:c1}})).status,404);
 assert.equal((await fetch(base+'/api/stream/00000000-0000-0000-0000-000000000000',{headers:{Cookie:c2}})).status,404);
});
test('open mode admits anonymous browsing and a media session, while rejecting a foreign origin',async t=>{const{base}=await setup(t,{openAccess:true});let r=await fetch(base+'/api/status');assert.equal(r.status,200);assert.equal((await r.json()).openAccess,true);r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example'},body:'{}'});assert.equal(r.status,403);r=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly/);});
test('open mode exposes an actor works page to anonymous visitors',async t=>{
 const actors=require('./actors.cjs');
 t.mock.method(actors,'fetchActorWorks',async(id,{offset})=>({actor_id:id,offset,works:[]}));
 const{base}=await setup(t,{openAccess:true});
 let r=await fetch(base+'/api/actors/123/works?offset=10');
 assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{actor_id:'123',offset:10,works:[]});
 r=await fetch(base+'/api/actors/123/works?offset=2000');
 assert.equal(r.status,200);
 assert.equal((await r.json()).offset,1000);
});
test('web QR login exposes a real image and confirmed account without owner auth',async t=>{
 const calls=[];
 const account={
  async startLogin(){return{success:true,loginId:'login-1',image:'data:image/png;base64,ZmFrZQ==',expiresIn:59};},
  async pollLogin(id){calls.push(id);return{success:true,status:'signed-in',account:{id:'42',nickname:'测试账号'}};},
  cancelLogin(id){calls.push('cancel:'+id);return{success:true};},
  async status(){return{success:true,signedIn:true,account:{id:'42',nickname:'测试账号'}};},
  async logout(){return{success:true};},
 };
 const{base}=await setup(t,{openAccess:true,account});
 let r=await fetch(base+'/api/login/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(r.status,200);
 const started=await r.json();
 assert.equal(started.loginId,'login-1');
 assert.equal(started.image,'ZmFrZQ==');
 assert.equal(started.expiresIn,59);
 r=await fetch(base+'/api/login/qr?id=login-1');
 assert.equal(r.status,200);
 const polled=await r.json();
 assert.equal(polled.state,'confirmed');
 assert.deepEqual(polled.account,{loggedIn:true,userId:'42',nickname:'测试账号',avatar:''});
 assert.deepEqual(calls,['login-1']);
 r=await fetch(base+'/api/login/status');
 assert.equal(r.status,200);
 assert.equal((await r.json()).account.loggedIn,true);
 r=await fetch(base+'/api/login/qr/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({loginId:'login-1'})});
 assert.equal(r.status,200);
 assert.deepEqual(calls,['login-1','cancel:login-1']);
 r=await fetch(base+'/api/login/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(r.status,200);
 assert.equal((await r.json()).signedIn,false);
});
test('serves the original app bundle, wails bindings and ranged media',async t=>{
 const{base}=await setup(t);
 let r=await fetch(base+'/');
 assert.equal(r.status,200);
 assert.match(await r.text(),/<title>短剧播放器<\/title>/);
 assert.match(r.headers.get('content-security-policy'),/script-src 'self' 'unsafe-inline'/);
 r=await fetch(base+'/wails/runtime.js');
 assert.equal(r.status,200);
 assert.match(await r.text(),/^window\.wailsbindings=.*;\n/);
 r=await fetch(base+'/assets/index.e161c0d9.js');
 assert.equal(r.status,200);
 assert.match(r.headers.get('content-type'),/^text\/javascript/);
 assert.match(r.headers.get('cache-control'),/immutable/);
 assert.ok((await r.arrayBuffer()).byteLength>1000000);
 r=await fetch(base+'/media/demo.mp4',{headers:{Range:'bytes=0-99'}});
 assert.equal(r.status,206);
 assert.equal(r.headers.get('content-range'),'bytes 0-99/29960918');
 assert.equal((await r.arrayBuffer()).byteLength,100);
 r=await fetch(base+'/media/demo.mp4',{method:'HEAD'});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('content-length'),'29960918');
});
