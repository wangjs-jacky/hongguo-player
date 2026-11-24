const {test}=require('node:test'),assert=require('node:assert/strict');
test('changing quality reuses a fresh compatible rendition without another model request or a lower-size source',async t=>{
 const app=require('../src/native/app-source');let calls=0;
 t.mock.method(app,'fetchAppPlayUrl',async(vid,options)=>{calls++;if(vid==='2')return {vid,url:'https://example.invalid/720',width:720,height:1280,codec:'hevc'};return {vid,url:'https://example.invalid/auto',width:720,height:1280,codec:'hevc',variants:[{vid,url:'https://example.invalid/720',width:720,height:1280,codec:'hevc'},{vid,url:'https://example.invalid/1080',width:1080,height:1920,codec:'hevc'}]};});
 delete require.cache[require.resolve('./online.cjs')];const online=require('./online.cjs');
 await online.source('1','auto');const fixed=await online.source('1','1080p');assert.equal(calls,1);assert.equal(fixed.width,1080);assert.ok(fixed.variants.every(v=>Math.min(v.width,v.height)>=1080));
 await online.source('2','720p');await online.source('2','1080p');assert.equal(calls,3);
});
