// Personal Web runtime, isolated from the desktop application and its data.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root=path.resolve(__dirname,'../.web-runtime');
fs.mkdirSync(root,{recursive:true,mode:0o700});
const tokenFile=path.join(root,'access-token');
if (!process.env.HONGGUO_TOKEN) {
  if (!fs.existsSync(tokenFile)) fs.writeFileSync(tokenFile,crypto.randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
  process.env.HONGGUO_TOKEN=fs.readFileSync(tokenFile,'utf8').trim();
}
process.env.DATA_DIR ||= path.join(root,'data');
process.env.DOWNLOAD_DIR ||= path.join(root,'downloads');
process.env.FFMPEG_PATH ||= '/opt/homebrew/bin/ffmpeg';
process.env.FFPROBE_PATH ||= '/opt/homebrew/bin/ffprobe';
const bvc=path.join(root,'bin','ffmpeg-bytevc2');
if(fs.existsSync(bvc))process.env.LIBREMPEG_PATH ||= bvc;
process.env.HONGGUO_WEB_DEVICE_FILE ||= path.join(root,'web-playback-device.json');
const {createApp}=require('./index.cjs');
const app=createApp({token:process.env.HONGGUO_TOKEN,dataRoot:process.env.DATA_DIR,downloadRoot:process.env.DOWNLOAD_DIR,openAccess:process.env.HONGGUO_OPEN_ACCESS !== '0',ownerAuthPath:process.env.HONGGUO_OWNER_AUTH_FILE||path.join(root,'owner-auth.json')});
const port=Number(process.env.PORT||3188);
app.server.listen(port,process.env.HOST||'0.0.0.0',()=>{console.log(`红果 Web 已启动，端口 ${port}；访问令牌保存在 .web-runtime/access-token（不写入日志）。`);if(process.send)process.send({type:'listening',port});});
app.server.on('error',err=>{console.error(err.code);process.exit(1);});
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>app.close().then(()=>process.exit(0)));
