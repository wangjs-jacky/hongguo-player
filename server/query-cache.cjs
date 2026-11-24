// Public upstream metadata only. Bounded cache, failed reads never cached, duplicate reads coalesced.
const values = new Map(), pending = new Map();
async function memo(key, ttl, load) {
  const entry = values.get(key);
  if (entry?.expires > Date.now()) return entry.value;
  if (pending.has(key)) return pending.get(key);
  const task = Promise.resolve().then(load).then(value => {
    if (value?.success !== false) {
      values.set(key, { value, expires: Date.now() + ttl });
      while (values.size > 160) values.delete(values.keys().next().value);
    }
    return value;
  }).finally(() => pending.delete(key));
  pending.set(key, task); return task;
}
module.exports = { memo };
