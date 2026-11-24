const {test}=require('node:test'),assert=require('node:assert/strict');
const {memo}=require('./query-cache.cjs');
const {seasonInfo,relatedSeasonInfo}=require('./discovery.cjs');
test('duplicate metadata requests coalesce; expired entries reload; rejection is not cached',async t=>{
 let now=1000;t.mock.method(Date,'now',()=>now);let calls=0,resolve;
 const loader=()=>{calls++;return new Promise(r=>resolve=r);};
 const a=memo('coalesce-test',100,loader),b=memo('coalesce-test',100,loader);await Promise.resolve();assert.equal(calls,1);resolve({items:[1]});assert.deepEqual(await a,await b);
 assert.deepEqual(await memo('coalesce-test',100,()=>assert.fail('cache miss')), {items:[1]});
 now=1101;assert.deepEqual(await memo('coalesce-test',100,()=>({items:[2]})),{items:[2]});
 await assert.rejects(memo('failure-test',100,()=>{throw Error('unavailable');}),/unavailable/);
 assert.equal(await memo('failure-test',100,()=>42),42);
 assert.equal((await memo('negative-test',100,()=>({success:false}))).success,false);
 assert.equal(await memo('negative-test',100,()=>43),43);
});
test('season parsing orders Chinese, Arabic and English suffixes without treating title digits as a season',()=>{
 assert.deepEqual(seasonInfo('好故事 第十二季'),{base:'好故事',number:12,explicit:true});
 assert.equal(seasonInfo('好故事（第二部）').number,2);
 assert.equal(seasonInfo('好故事 Season 3').number,3);
 assert.equal(seasonInfo('好故事（2）').base,'好故事');
 assert.equal(seasonInfo('重生1980').explicit,false);
});

test('related seasons accept a short numbered sequel suffix but preserve years and numbers inside the title',()=>{assert.equal(relatedSeasonInfo('少夫人来自东北3').number,3);assert.equal(relatedSeasonInfo('重生1980').base,'重生1980');assert.equal(relatedSeasonInfo('回到2018').base,'回到2018');});
