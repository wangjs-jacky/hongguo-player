const { memo } = require('./query-cache.cjs');
const { search } = require('./search.cjs');
async function catalog(options) {
  return memo('catalog:' + JSON.stringify(options), 120000, async () => {
    const result = await require('../src/native/catalog').browseList({ ...options, allowTrustedDns: true });
    // Web genre slugs and App genre IDs are different; never silently show an unfiltered list.
    if (result.success || options.genre) return result;
    return require('../src/native/hongguo-app-catalog').browseList(options);
  });
}
function seasonInfo(title) {
  const raw = String(title || '').trim();
  const match = raw.match(/[（(【\s]*第?\s*([0-9零一二两三四五六七八九十]+)\s*(?:季|部|期|辑)[）)】\s]*$/i)
    || raw.match(/[（(【\s]*(?:Season|S)\s*(\d+)[）)】\s]*$/i)
    || raw.match(/[（(【]\s*(\d+)\s*[）)】]$/);
  if (!match) return { base: raw, number: 1, explicit: false };
  const digits = {零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
  const num = /^\d+$/.test(match[1]) ? Number(match[1]) : match[1].includes('十')
    ? (digits[match[1].split('十')[0]] || 1) * 10 + (digits[match[1].split('十')[1]] || 0) : digits[match[1]];
  const base = raw.slice(0,match.index).replace(/[\s:：·_—-]+$/,'');
  return num > 0 && num <= 100 && base ? { base, number:num, explicit:true } : {base:raw,number:1,explicit:false};
}
function relatedSeasonInfo(title) {
  const info=seasonInfo(title);if(info.explicit)return info;
  const match=String(title||'').trim().match(/^(.{4,}?)([1-9]|1[0-9]|20)$/);
  if(!match||/\d$/.test(match[1]))return info;
  return {base:match[1].replace(/[\s:：·_—-]+$/,''),number:Number(match[2]),explicit:false};
}
async function seasons(series) {
  const info = relatedSeasonInfo(series.series_title), normalized = s => s.replace(/[\s:：·_—-]/g,'').toLowerCase();
  const result = await search(info.base, {page:1});
  const seen = new Set();
  const items = [series,...result.results].filter(item => {
    if (seen.has(item.series_id) || normalized(relatedSeasonInfo(item.series_title).base) !== normalized(info.base)) return false;
    seen.add(item.series_id); return true;
  }).map(item => ({series_id:item.series_id,series_title:item.series_title,cover:item.cover,total:item.total||item.episode_count,season:relatedSeasonInfo(item.series_title).number})).sort((a,b)=>a.season-b.season);
  return {success:true,items,notice:'依据剧名匹配相关季，可能不包含全部续作。'};
}
module.exports = { catalog, seasons, seasonInfo, relatedSeasonInfo };
