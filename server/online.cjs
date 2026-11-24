// GPL-3.0-only. Authenticated range playback using the registered current player API.
const {fetchAppPlayUrl}=require('../src/native/app-source');
const {resolvePlay,available:resolverAvailable}=require('./hg-resolve.cjs');
const {prepareRangeMedia}=require('./range-media.cjs');
const {mediaGuard}=require('./media.cjs');
const sources=new Map(), plans=new Map();
function playbackCodec(value){
  const codec=String(value||'').toLowerCase();
  if(codec==='bytevc2')return 'bytevc2';
  if(codec==='bytevc1'||codec==='hevc'||codec==='h265')return 'hevc';
  if(codec==='h264'||codec==='avc'||codec==='avc1')return 'h264';
  return codec||'h264';
}
function definitionOf(quality){
  if(!quality||quality==='auto')return undefined;
  const value=Number(String(quality).replace(/[^0-9]/g,''));
  return Number.isFinite(value)&&value>0?value:undefined;
}
function dimensions(definition){
  const short=Number(definition)||1080;
  return {width:short,height:Math.round(short*16/9)};
}
async function resolveOfficial(seriesId,vid,quality,signal){
  const value=await resolvePlay({seriesId,vid,definition:definitionOf(quality),signal});
  if(!value.ok||!value.url)throw Object.assign(new Error(value.error||'本集暂无完整片源'),{code:'RESOLVE_FAILED'});
  const info={vid,url:value.url,contentKey:value.cenc_key_hex||null,codec:playbackCodec(value.codec),
    source:'app',quality:`${value.definition||definitionOf(quality)||''}p`,dimensionHint:true,...dimensions(value.definition)};
  return {...info,variants:[info]};
}
async function source(vid,quality='auto',signal,seriesId){
  const key=vid+':'+quality,entry=sources.get(key);
  if(entry?.expires>Date.now())return entry.info;
  // Reuse a recently resolved rendition when changing quality. Never reuse a lower-size source.
  if(quality !== 'auto') {
    const minimum=quality==='1080p'?1080:quality==='720p'?720:Infinity;
    for(const [cachedKey,cached] of sources) {
      if(!cachedKey.startsWith(vid+':')||cached.expires<=Date.now())continue;
      const variants=(cached.info.variants||[cached.info]).filter(v=>Math.min(v.width||0,v.height||0)>=minimum)
        .sort((a,b)=>Math.min(a.width,a.height)-Math.min(b.width,b.height));
      if(variants.length){const info={...cached.info,...variants[0],variants};sources.set(key,{info,expires:cached.expires});return info;}
    }
  }
  const info=seriesId&&resolverAvailable()
    ? await resolveOfficial(seriesId,vid,quality,signal)
    : await fetchAppPlayUrl(vid,{protocol:'web-v2',quality,signal});
  if(!info?.url)throw Error('本集暂无完整片源');
  sources.set(key,{info,expires:Date.now()+45000});
  while(sources.size>16)sources.delete(sources.keys().next().value);
  return info;
}
async function prepare(vid,quality,signal,seriesId){
  const key=vid+':'+quality, cached=plans.get(key);
  if(cached?.expires>Date.now())return cached.value;
  const info=await source(vid,quality,signal,seriesId);
  if(info.codec==='bytevc2')return {compatible:true,codec:info.codec,duration:info.duration};
  let last;
  for(const variant of (info.variants||[info]).slice(0,3)){
    signal?.throwIfAborted();
    try{const plan=await prepareRangeMedia(variant,mediaGuard,signal);const value={plan,codec:variant.codec||info.codec,duration:plan.duration||info.duration,width:variant.width||info.width,height:variant.height||info.height};plans.set(key,{value,expires:Date.now()+30000});while(plans.size>4)plans.delete(plans.keys().next().value);return value;}
    catch(error){last=error;if(signal?.aborted)throw error;}
  }
  throw last||Error('当前节点不可用，请重试');
}
module.exports={source,prepare,clear(){sources.clear();plans.clear();}};
