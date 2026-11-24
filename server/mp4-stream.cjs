// SPDX-License-Identifier: GPL-3.0-only
// Adapted from zfdang/hongguo-open-player src/server/native/hongguo.js.
// Original per-file license retained; see docs/web-v2.md for source revision.
function parseBoxes(data, start, end, depth = 0) {
  if (depth > 32) throw new Error('MP4 box nesting exceeds limit');
  const boxes = [];
  let off = start;
  while (off + 8 <= end) {
    let size = data.readUInt32BE(off);
    const typ = data.subarray(off + 4, off + 8).toString('latin1');
    let hdr = 8;
    if (size === 1) {
      if (off + 16 > end) throw new Error('Truncated MP4 box header');
      size = Number(data.readBigUInt64BE(off + 8));
      hdr = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (!Number.isSafeInteger(size) || size < hdr || off + size > end) throw new Error('Invalid MP4 box size');
    let children = null;
    if (['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta'].includes(typ)) {
      children = parseBoxes(data, off + hdr, off + size, depth + 1);
    }
    boxes.push({ typ, off, size, hdr, children });
    off += size;
  }
  if (off !== end) throw new Error('Truncated MP4 box');
  return boxes;
}

/**
 * 重建 moov box
 */
function rebuildMoov(data, moovOff, moovSize, top, order = top, relocate) {
  const moovBox = top.find(b => b.typ === 'moov');
  if (!moovBox) throw new Error('no moov box');

  function clone(box) {
    return {
      typ: box.typ,
      off: box.off,
      size: box.size,
      hdr: box.hdr,
      children: box.children ? box.children.map(clone) : null
    };
  }

  function prune(box) {
    if (!box.children) return box;
    const keep = [];
    for (const c of box.children) {
      if (['senc', 'saio', 'saiz', 'sgpd', 'sbgp'].includes(c.typ)) continue;
      keep.push(prune(c));
    }
    box.children = keep;
    return box;
  }

  const tree = prune(clone(moovBox));

  function* walkChildren(box) {
    for (const c of (box.children || [])) {
      yield c;
      for (const x of walkChildren(c)) yield x;
    }
  }

  const patches = {};
  for (const b of walkChildren(tree)) {
    if (b.typ === 'stsd') {
      const content = b.off + 8;
      const count = data.readUInt32BE(content + 4);
      let p = content + 8;
      const entries = [];
      for (let i = 0; i < count; i++) {
        let esize = data.readUInt32BE(p);
        const etyp = data.subarray(p + 4, p + 8).toString('latin1');
        if (etyp === 'encv' || etyp === 'enca') {
          const hdrSize = etyp === 'encv' ? 78 : 28;
          const children = parseBoxes(data, p + 8 + hdrSize, p + esize);
          let newType;
          if (etyp === 'enca') {
            if (data.readUInt16BE(p + 16) !== 0) throw new Error('Unsupported audio sample entry version');
            const sinf = children.find(child => child.typ === 'sinf');
            const frma = sinf && parseBoxes(data, sinf.off + sinf.hdr, sinf.off + sinf.size).find(child => child.typ === 'frma');
            newType = frma && frma.size === frma.hdr + 4 ? data.toString('latin1', frma.off + frma.hdr, frma.off + frma.hdr + 4) : null;
            if (!['mp4a', 'ac-3', 'ec-3', 'Opus', 'fLaC'].includes(newType)) throw new Error('Unsupported protected audio codec');
          }
          if (etyp === 'encv') {
            const sinf = children.find(child => child.typ === 'sinf');
            const frma = sinf && parseBoxes(data, sinf.off + sinf.hdr, sinf.off + sinf.size).find(child => child.typ === 'frma');
            const original = frma && frma.size === frma.hdr + 4
              ? data.toString('latin1', frma.off + frma.hdr, frma.off + frma.hdr + 4) : null;
            const avc = children.some(child => child.typ === 'avcC');
            const hevc = children.some(child => child.typ === 'hvcC');
            newType = original || (avc && !hevc ? 'avc1' : hevc && !avc ? 'hvc1' : null);
            if (!['avc1', 'avc3', 'hvc1', 'hev1'].includes(newType)
              || (newType.startsWith('avc') ? !avc || hevc : !hevc || avc)) {
              throw new Error('无法确定加密视频的原始编码（codec），请更换片源重试。');
            }
          }
          const entry = Buffer.alloc(8 + hdrSize);
          entry.writeUInt32BE(0, 0);
          entry.write(newType, 4, 4, 'latin1');
          data.copy(entry, 8, p + 8, p + 8 + hdrSize);

          const entryExtra = Buffer.concat(children.filter(child => child.typ !== 'sinf')
            .map(child => data.subarray(child.off, child.off + child.size)));
          const fullEntry = Buffer.concat([entry, entryExtra]);
          fullEntry.writeUInt32BE(fullEntry.length, 0);
          entries.push(fullEntry);
        } else {
          entries.push(data.subarray(p, p + esize));
        }
        p += esize;
      }
      const stsdHdr = Buffer.alloc(16);
      data.copy(stsdHdr, 0, b.off, content + 8);
      stsdHdr.writeUInt32BE(entries.length, 12);
      const fullStsd = Buffer.concat([stsdHdr, ...entries]);
      fullStsd.writeUInt32BE(fullStsd.length, 0);
      patches[b.off] = fullStsd;
    }
  }

  function serialize(box) {
    if (!box.children) {
      return patches[box.off] || data.subarray(box.off, box.off + box.size);
    }
    const body = Buffer.concat(box.children.map(serialize));
    const hdrb = Buffer.alloc(box.hdr);
    data.copy(hdrb, 0, box.off, box.off + box.hdr);
    if (box.hdr === 8) {
      hdrb.writeUInt32BE(8 + body.length, 0);
    } else {
      hdrb.writeUInt32BE(1, 0);
      hdrb.writeBigUInt64BE(BigInt(16 + body.length), 8);
    }
    return Buffer.concat([hdrb, body]);
  }

  const first = serialize(tree);
  const destinations = new Map();
  let destination = 0;
  for (const box of order) {
    destinations.set(box.off, destination);
    destination += box.typ === 'moov' ? first.length : box.size;
  }
  for (const b of walkChildren(tree)) {
    if (b.typ === 'stco' || b.typ === 'co64') {
      const count = data.readUInt32BE(b.off + b.hdr + 4);
      const stride = b.typ === 'co64' ? 8 : 4;
      if (b.hdr + 8 + count * stride > b.size) throw new Error('Invalid MP4 chunk table');
      for (let i = 0; i < count; i++) {
        const position = b.off + b.hdr + 8 + i * stride;
        const old = stride === 8 ? Number(data.readBigUInt64BE(position)) : data.readUInt32BE(position);
        if (relocate) {
          const updated = relocate(old, first.length);
          if (stride === 8) data.writeBigUInt64BE(BigInt(updated), position);
          else data.writeUInt32BE(updated, position);
          continue;
        }
        const source = top.find(box => old >= box.off && old < box.off + box.size);
        if (!Number.isSafeInteger(old) || !source) throw new Error('Invalid MP4 chunk offset');
        const updated = old + destinations.get(source.off) - source.off;
        if (stride === 8) data.writeBigUInt64BE(BigInt(updated), position);
        else data.writeUInt32BE(updated, position);
      }
    }
  }

  return serialize(tree);
}

function mp4TrackInfo(data, top, total) {
  const getBox = (boxes, type) => (boxes || []).find(box => box.typ === type);
  function* walkBoxes(boxes) {
    for (const box of boxes) { if (box.children) yield* walkBoxes(box.children); yield box; }
  }
  if (top.some(box => box.typ === 'moof')) throw new Error('Fragmented MP4 is not supported');
  const stbls = Array.from(walkBoxes(top)).filter(b => b.typ === 'stbl');
  const trackInfo = [];
  let sampleBudget = 0;
  for (const stbl of stbls) {
    const stsz = getBox(stbl.children, 'stsz');
    const stco = getBox(stbl.children, 'stco') || getBox(stbl.children, 'co64');
    const stsc = getBox(stbl.children, 'stsc');
    const senc = getBox(stbl.children, 'senc');
    const stsd = getBox(stbl.children, 'stsd');
    let encrypted = false;
    if (stsd) {
      let cursor = stsd.off + 16;
      const count = data.readUInt32BE(stsd.off + 12);
      for (let i = 0; i < count; i++) {
        if (cursor + 8 > stsd.off + stsd.size) throw new Error('Truncated MP4 sample description');
        const size = data.readUInt32BE(cursor);
        if (size < 8 || cursor + size > stsd.off + stsd.size) throw new Error('Invalid MP4 sample description');
        const type = data.toString('latin1', cursor + 4, cursor + 8);
        encrypted ||= type === 'encv' || type === 'enca';
        cursor += size;
      }
    }
    if (encrypted && (!stsz || !stco || !stsc || !senc)) throw new Error('Unsupported encrypted MP4 track layout');
    if (!stsz || !stco || !stsc) continue;

    const ss = data.readUInt32BE(stsz.off + 12);
    const n = data.readUInt32BE(stsz.off + 16);
    sampleBudget += n;
    if (sampleBudget > 100000) throw new Error('MP4 sample count exceeds budget');
    if (n > 100000 || (ss === 0 && 20 + n * 4 > stsz.size)) throw new Error('Invalid MP4 sample sizes');
    let sizes = [];
    if (ss === 0) {
      for (let i = 0; i < n; i++) {
        sizes.push(data.readUInt32BE(stsz.off + 20 + i * 4));
      }
    } else {
      sizes = new Array(n).fill(ss);
    }

    const nc = data.readUInt32BE(stco.off + 12);
    const chunkStride = stco.typ === 'co64' ? 8 : 4;
    if (16 + nc * chunkStride > stco.size) throw new Error('Invalid MP4 chunk offsets');
    const chunkOffs = [];
    for (let i = 0; i < nc; i++) {
      const position = stco.off + 16 + i * chunkStride;
      const offset = chunkStride === 8 ? Number(data.readBigUInt64BE(position)) : data.readUInt32BE(position);
      if (!Number.isSafeInteger(offset)) throw new Error('Unsafe MP4 chunk offset');
      chunkOffs.push(offset);
    }

    const ns = data.readUInt32BE(stsc.off + 12);
    if (16 + ns * 12 > stsc.size) throw new Error('Invalid MP4 sample-to-chunk table');
    const stscTab = [];
    for (let i = 0; i < ns; i++) {
      stscTab.push([
        data.readUInt32BE(stsc.off + 16 + i * 12),
        data.readUInt32BE(stsc.off + 20 + i * 12),
        data.readUInt32BE(stsc.off + 24 + i * 12),
      ]);
    }

    const ivs = [];
    if (senc) {
      const sc = data.readUInt32BE(senc.off + 12);
      if (data.readUInt32BE(senc.off + 8) !== 0 || sc !== n || senc.size !== 16 + sc * 8) {
        throw new Error('Unsupported CENC encryption layout (requires full samples and 8-byte IVs)');
      }
      for (let i = 0; i < sc; i++) {
        ivs.push(data.subarray(senc.off + 16 + i * 8, senc.off + 24 + i * 8));
      }
    }

    if (!senc && stbl.children.some(box => ['saio', 'saiz'].includes(box.typ))) throw new Error('Unsupported external CENC auxiliary data');
    if (n > 0 && (!stscTab.length || stscTab[0][0] !== 1)) throw new Error('Invalid first MP4 chunk');
    for (let i = 0; i < stscTab.length; i++) {
      const [first, samples] = stscTab[i];
      if (first < 1 || first > nc || samples < 1 || samples > n || (i && first <= stscTab[i - 1][0])) throw new Error('Invalid MP4 chunk mapping');
    }
    const chunkSpc = {};
    for (let i = 0; i < stscTab.length; i++) {
      const fc = stscTab[i][0];
      const spc = stscTab[i][1];
      const nxt = (i + 1 < stscTab.length) ? stscTab[i + 1][0] : (nc + 1);
      for (let ci = fc - 1; ci < nxt - 1; ci++) {
        chunkSpc[ci] = spc;
      }
    }

    const sampleOffs = [];
    let si = 0;
    for (let ci = 0; ci < nc; ci++) {
      let off = chunkOffs[ci];
      const spc = chunkSpc[ci] || 1;
      for (let s = 0; s < spc; s++) {
        if (si >= n) break;
        sampleOffs.push(off);
        off += sizes[si];
        si++;
      }
    }

    if (si !== n) throw new Error('MP4 sample-to-chunk count mismatch');
    trackInfo.push({ sizes, offs: sampleOffs, ivs, stco, encrypted });
  }

  return trackInfo;
}

function hasSampleEncryption(boxes) {
  return boxes.some(box => box.typ === 'senc' || (box.children && hasSampleEncryption(box.children)));
}

function createMp4StreamingPlan(metadata, boxes, total) {
  if (boxes.some(box => box.typ === 'moof')) throw new Error('Fragmented MP4 is not supported');
  const localBoxes = parseBoxes(metadata, 0, metadata.length);
  const moov = boxes.find(box => box.typ === 'moov');
  const order = boxes.filter(box => box !== moov);
  const firstMedia = order.findIndex(box => box.typ === 'mdat');
  if (!moov || firstMedia < 0) throw new Error('MP4 requires moov and mdat');
  order.splice(firstMedia, 0, moov);
  const tracks = mp4TrackInfo(metadata, localBoxes, total);
  const relocate = (offset, moovSize) => {
    if (!Number.isSafeInteger(offset)) throw new Error('Unsafe MP4 offset');
    let destination = 0;
    for (const box of order) {
      if (box.typ !== 'moov' && offset >= box.off && offset < box.off + box.size) return destination + offset - box.off;
      destination += box.typ === 'moov' ? moovSize : box.size;
    }
    throw new Error('MP4 offset outside media');
  };
  const rebuilt = rebuildMoov(metadata, 0, metadata.length, localBoxes, localBoxes, relocate);
  let size = 0;
  const segments = order.map(box => {
    const segment = { start: size, size: box.typ === 'moov' ? rebuilt.length : box.size,
      ...(box.typ === 'moov' ? { buffer: rebuilt } : { remote: box.off }) };
    size += segment.size;
    return segment;
  });
  const samples = tracks.flatMap(track => track.ivs.map((iv, index) => ({ offset: track.offs[index], size: track.sizes[index], iv })))
    .sort((a, b) => a.offset - b.offset);
  if (samples.length > 100000) throw new Error('MP4 sample count exceeds streaming budget');
  for (const sample of samples) if (!Number.isSafeInteger(sample.offset) || sample.offset + sample.size > total) throw new Error('Invalid encrypted MP4 sample');
  return { size, segments, samples, encrypted: hasSampleEncryption(localBoxes) || tracks.some(track => track.encrypted || track.ivs.length) };
}


module.exports={createMp4StreamingPlan};
