// Private, local owner grants. Only digests are persisted; viewing sessions
// never carry management permissions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const OWNER_AGE=7*24*3600;
function createOwnerAuth(file){
  function read(){if(!file)return {invitations:[],sessions:[]};try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(data.invitations)||!Array.isArray(data.sessions))throw Error('invalid owner auth state');return data;}catch(e){if(e.code==='ENOENT')return {invitations:[],sessions:[]};throw e;}}
  function save(data){if(!file)throw Error('本人管理入口未配置');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{try{fs.unlinkSync(temp);}catch{}}}
  const clean=data=>({invitations:data.invitations.filter(x=>x.expires>Date.now()),sessions:data.sessions.filter(x=>x.expires>Date.now())});
  function authorized(cookie){const value=/(?:^|;\s*)hg_owner=([a-f0-9]{64})(?:;|$)/.exec(cookie||'')?.[1];return !!value&&read().sessions.some(s=>s.expires>Date.now()&&s.hash===hash(value));}
  return {authorized,
    issueInvitation(){const data=clean(read()),code=crypto.randomBytes(32).toString('hex');data.invitations=[{hash:hash(code),expires:Date.now()+15*60000}];save(data);return code;},
    exchange(code){if(typeof code!=='string'||!/^[a-f0-9]{64}$/.test(code))return null;const data=clean(read()),digest=hash(code),i=data.invitations.findIndex(x=>x.hash===digest);if(i<0)return null;data.invitations.splice(i,1);const value=crypto.randomBytes(32).toString('hex');data.sessions=data.sessions.slice(-31);data.sessions.push({hash:hash(value),expires:Date.now()+OWNER_AGE*1000});save(data);return value;},
    revoke(cookie){const value=/(?:^|;\s*)hg_owner=([a-f0-9]{64})(?:;|$)/.exec(cookie||'')?.[1];if(!value)return;const data=clean(read());data.sessions=data.sessions.filter(x=>x.hash!==hash(value));save(data);}
  };
}
module.exports={createOwnerAuth,OWNER_AGE};
