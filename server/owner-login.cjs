// Run on the server. The login URL stays in a private local file, never in
// the public source bundle or normal process output.
const fs=require('node:fs'),path=require('node:path');
const {createOwnerAuth}=require('./owner-access.cjs');
const root=path.resolve(__dirname,'../.web-runtime');
const origin=new URL(process.env.HONGGUO_PUBLIC_ORIGIN||'https://hongguo.paws.rodeo');
if(origin.protocol!=='https:'&&origin.hostname!=='127.0.0.1')throw Error('管理入口必须使用HTTPS或本机回环地址');
const code=createOwnerAuth(process.env.HONGGUO_OWNER_AUTH_FILE||path.join(root,'owner-auth.json')).issueInvitation();
const file=path.join(root,'owner-login-link.txt');fs.mkdirSync(root,{recursive:true,mode:0o700});fs.writeFileSync(file,origin.origin+'/?owner-entry=4.2#/owner?code='+code+'\n',{mode:0o600});
console.log('一次性本人管理入口已保存到受保护的 .web-runtime/owner-login-link.txt，有效15分钟；登录后保留7天。');
