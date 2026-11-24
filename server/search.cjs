const axios = require('axios');
const { searchApp } = require('../src/native/hongguo-app-search');
const { searchHongguo, SEARCH_ENDPOINT } = require('../src/native/hongguo-search');
const { webMediaRequestOptions } = require('../src/native/web-media-guard');
const { memo } = require('./query-cache.cjs');
const cursors = new Map();
async function search(keyword, options = {}) {
  return memo('search:' + keyword + ':' + (options.page || 1), 120000, async () => {
    try {
      const result = await searchHongguo(keyword, { ...options, retries: 0, timeout: 3500, cache: false,
        request: async (q, page, { timeout }) => (await axios.get(SEARCH_ENDPOINT, {
          ...webMediaRequestOptions(SEARCH_ENDPOINT, { trustedOfficialDns: true }), proxy: false,
          params: { aid: '8662', query: q, page }, timeout,
          headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://hongguoduanju.com/' },
          maxContentLength: 4 * 1024 * 1024, responseType: 'json'
        })).data
      });
      return { ...result, source: 'web' };
    } catch {
      const key = keyword + ':' + (options.page || 1), cached = cursors.get(key);
      const result = await searchApp(keyword, { ...options, deadline: Date.now() + 5000, cursor: cached?.expires > Date.now() ? cached.cursor : null });
      if (result.hasMore) cursors.set(keyword + ':' + (options.page + 1), { cursor: result.cursor, expires: Date.now() + 300000 });
      while (cursors.size > 100) cursors.delete(cursors.keys().next().value);
      return { ...result, source: 'app' };
    }
  });
}
module.exports = { search };
