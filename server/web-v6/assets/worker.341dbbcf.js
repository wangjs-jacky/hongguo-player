var Pe = Object.defineProperty;
var Le = (n, s, t) =>
  s in n
    ? Pe(n, s, { enumerable: !0, configurable: !0, writable: !0, value: t })
    : (n[s] = t);
var st = (n, s, t) => (Le(n, typeof s != "symbol" ? s + "" : s, t), t);
var He = (() =>
    async function (n = {}) {
      var s,
        t = n,
        i = "./this.program",
        o = (e, r) => {
          throw r;
        },
        f = import.meta.url,
        c = "";
      function y(e) {
        return t.locateFile ? t.locateFile(e, c) : c + e;
      }
      var d, b;
      {
        try {
          c = new URL(".", f).href;
        } catch {}
        ((b = (e) => {
          var r = new XMLHttpRequest();
          return (
            r.open("GET", e, !1),
            (r.responseType = "arraybuffer"),
            r.send(null),
            new Uint8Array(r.response)
          );
        }),
          (d = async (e) => {
            var r = await fetch(e, { credentials: "same-origin" });
            if (r.ok) return r.arrayBuffer();
            throw new Error(r.status + " : " + r.url);
          }));
      }
      var g = console.log.bind(console),
        w = console.error.bind(console),
        F,
        M = !1,
        W,
        H,
        A,
        S,
        C,
        z,
        X,
        B,
        V,
        O = !1;
      function q() {
        var e = S.buffer;
        ((C = new Int8Array(e)),
          (X = new Int16Array(e)),
          (t.HEAPU8 = z = new Uint8Array(e)),
          (B = new Uint32Array(e)),
          (V = new BigInt64Array(e)),
          new BigUint64Array(e));
      }
      function K() {
        if (t.preRun)
          for (
            typeof t.preRun == "function" && (t.preRun = [t.preRun]);
            t.preRun.length;

          )
            Xt(t.preRun.shift());
        et(kt);
      }
      function Q() {
        ((O = !0), x.t());
      }
      function ot() {
        if (t.postRun)
          for (
            typeof t.postRun == "function" && (t.postRun = [t.postRun]);
            t.postRun.length;

          )
            Jt(t.postRun.shift());
        et(Ut);
      }
      var R = 0,
        I = null;
      function ft(e) {
        var r;
        (R++, (r = t.monitorRunDependencies) == null || r.call(t, R));
      }
      function ct(e) {
        var a;
        if (
          (R--,
          (a = t.monitorRunDependencies) == null || a.call(t, R),
          R == 0 && I)
        ) {
          var r = I;
          ((I = null), r());
        }
      }
      function G(e) {
        var a;
        ((a = t.onAbort) == null || a.call(t, e),
          (e = "Aborted(" + e + ")"),
          w(e),
          (M = !0),
          (e += ". Build with -sASSERTIONS for more info."));
        var r = new WebAssembly.RuntimeError(e);
        throw (A == null || A(r), r);
      }
      var N;
      function tt() {
        return t.locateFile
          ? y("hevcdec.wasm")
          : new URL("/assets/hevcdec.e298f353.wasm", self.location).href;
      }
      function h(e) {
        if (e == N && F) return new Uint8Array(F);
        if (b) return b(e);
        throw "both async and sync fetching of the wasm failed";
      }
      async function u(e) {
        if (!F)
          try {
            var r = await d(e);
            return new Uint8Array(r);
          } catch {}
        return h(e);
      }
      async function _(e, r) {
        try {
          var a = await u(e),
            l = await WebAssembly.instantiate(a, r);
          return l;
        } catch (v) {
          (w(`failed to asynchronously prepare wasm: ${v}`), G(v));
        }
      }
      async function m(e, r, a) {
        if (!e && typeof WebAssembly.instantiateStreaming == "function")
          try {
            var l = fetch(r, { credentials: "same-origin" }),
              v = await WebAssembly.instantiateStreaming(l, a);
            return v;
          } catch (p) {
            (w(`wasm streaming compile failed: ${p}`),
              w("falling back to ArrayBuffer instantiation"));
          }
        return _(r, a);
      }
      function D() {
        return { a: Se };
      }
      async function P() {
        function e(p, U) {
          return ((x = p.exports), (S = x.s), q(), (Ct = x.H), Ee(x), ct(), x);
        }
        ft();
        function r(p) {
          return e(p.instance);
        }
        var a = D();
        if (t.instantiateWasm)
          return new Promise((p, U) => {
            t.instantiateWasm(a, (k, $) => {
              p(e(k));
            });
          });
        N != null || (N = tt());
        var l = await m(F, N, a),
          v = r(l);
        return v;
      }
      class E {
        constructor(r) {
          st(this, "name", "ExitStatus");
          ((this.message = `Program terminated with exit(${r})`),
            (this.status = r));
        }
      }
      var et = (e) => {
          for (; e.length > 0; ) e.shift()(t);
        },
        Ut = [],
        Jt = (e) => Ut.push(e),
        kt = [],
        Xt = (e) => kt.push(e),
        lt = !0,
        At = [],
        Ct,
        Qt = (e) => {
          var r = At[e];
          return (r || (At[e] = r = Ct.get(e)), r);
        },
        xt = (e, r) => Qt(e)(r),
        Rt = typeof TextDecoder < "u" ? new TextDecoder() : void 0,
        Yt = (e, r = 0, a = NaN) => {
          for (var l = r + a, v = r; e[v] && !(v >= l); ) ++v;
          if (v - r > 16 && e.buffer && Rt) return Rt.decode(e.subarray(r, v));
          for (var p = ""; r < v; ) {
            var U = e[r++];
            if (!(U & 128)) {
              p += String.fromCharCode(U);
              continue;
            }
            var k = e[r++] & 63;
            if ((U & 224) == 192) {
              p += String.fromCharCode(((U & 31) << 6) | k);
              continue;
            }
            var $ = e[r++] & 63;
            if (
              ((U & 240) == 224
                ? (U = ((U & 15) << 12) | (k << 6) | $)
                : (U = ((U & 7) << 18) | (k << 12) | ($ << 6) | (e[r++] & 63)),
              U < 65536)
            )
              p += String.fromCharCode(U);
            else {
              var Ft = U - 65536;
              p += String.fromCharCode(55296 | (Ft >> 10), 56320 | (Ft & 1023));
            }
          }
          return p;
        };
      function Zt(e, r, a) {
        return 0;
      }
      function jt(e, r, a) {
        return 0;
      }
      function te(e, r, a, l) {}
      var ee = () => G(""),
        Et = 0,
        ne = () => {
          ((lt = !1), (Et = 0));
        },
        nt = {},
        St = (e) => {
          if (e instanceof E || e == "unwind") return W;
          o(1, e);
        },
        Tt = () => lt || Et > 0,
        Pt = (e) => {
          var r;
          ((W = e),
            Tt() || ((r = t.onExit) == null || r.call(t, e), (M = !0)),
            o(e, new E(e)));
        },
        re = (e, r) => {
          ((W = e), Pt(e));
        },
        se = re,
        ie = () => {
          if (!Tt())
            try {
              se(W);
            } catch (e) {
              St(e);
            }
        },
        ae = (e) => {
          if (!M)
            try {
              (e(), ie());
            } catch (r) {
              St(r);
            }
        },
        Lt = () => performance.now(),
        oe = (e, r) => {
          if ((nt[e] && (clearTimeout(nt[e].id), delete nt[e]), !r)) return 0;
          var a = setTimeout(() => {
            (delete nt[e], ae(() => Bt(e, Lt())));
          }, r);
          return ((nt[e] = { id: a, timeout_ms: r }), 0);
        },
        fe = (e, r, a, l) => {
          if (!(l > 0)) return 0;
          for (var v = a, p = a + l - 1, U = 0; U < e.length; ++U) {
            var k = e.codePointAt(U);
            if (k <= 127) {
              if (a >= p) break;
              r[a++] = k;
            } else if (k <= 2047) {
              if (a + 1 >= p) break;
              ((r[a++] = 192 | (k >> 6)), (r[a++] = 128 | (k & 63)));
            } else if (k <= 65535) {
              if (a + 2 >= p) break;
              ((r[a++] = 224 | (k >> 12)),
                (r[a++] = 128 | ((k >> 6) & 63)),
                (r[a++] = 128 | (k & 63)));
            } else {
              if (a + 3 >= p) break;
              ((r[a++] = 240 | (k >> 18)),
                (r[a++] = 128 | ((k >> 12) & 63)),
                (r[a++] = 128 | ((k >> 6) & 63)),
                (r[a++] = 128 | (k & 63)),
                U++);
            }
          }
          return ((r[a] = 0), a - v);
        },
        ce = (e, r, a) => fe(e, z, r, a),
        Ht = () => Date.now(),
        ue = (e) => e >= 0 && e <= 3;
      function le(e, r, a) {
        if (!ue(e)) return 28;
        var l;
        e === 0 ? (l = Ht()) : (l = Lt());
        var v = Math.round(l * 1e3 * 1e3);
        return ((V[a >> 3] = BigInt(v)), 0);
      }
      var he = () => 2147483648,
        ge = (e, r) => Math.ceil(e / r) * r,
        ve = (e) => {
          var r = S.buffer,
            a = ((e - r.byteLength + 65535) / 65536) | 0;
          try {
            return (S.grow(a), q(), 1);
          } catch {}
        },
        _e = (e) => {
          var r = z.length;
          e >>>= 0;
          var a = he();
          if (e > a) return !1;
          for (var l = 1; l <= 4; l *= 2) {
            var v = r * (1 + 0.2 / l);
            v = Math.min(v, e + 100663296);
            var p = Math.min(a, ge(Math.max(e, v), 65536)),
              U = ve(p);
            if (U) return !0;
          }
          return !1;
        },
        ht = {},
        pe = () => i || "./this.program",
        rt = () => {
          if (!rt.strings) {
            var e =
                (
                  (typeof navigator == "object" && navigator.language) ||
                  "C"
                ).replace("-", "_") + ".UTF-8",
              r = {
                USER: "web_user",
                LOGNAME: "web_user",
                PATH: "/",
                PWD: "/",
                HOME: "/home/web_user",
                LANG: e,
                _: pe(),
              };
            for (var a in ht) ht[a] === void 0 ? delete r[a] : (r[a] = ht[a]);
            var l = [];
            for (var a in r) l.push(`${a}=${r[a]}`);
            rt.strings = l;
          }
          return rt.strings;
        },
        ye = (e, r) => {
          var a = 0,
            l = 0;
          for (var v of rt()) {
            var p = r + a;
            ((B[(e + l) >> 2] = p), (a += ce(v, p, 1 / 0) + 1), (l += 4));
          }
          return 0;
        },
        me = (e) => {
          for (var r = 0, a = 0; a < e.length; ++a) {
            var l = e.charCodeAt(a);
            l <= 127
              ? r++
              : l <= 2047
                ? (r += 2)
                : l >= 55296 && l <= 57343
                  ? ((r += 4), ++a)
                  : (r += 3);
          }
          return r;
        },
        de = (e, r) => {
          var a = rt();
          B[e >> 2] = a.length;
          var l = 0;
          for (var v of a) l += me(v) + 1;
          return ((B[r >> 2] = l), 0);
        },
        we = (e) => 52,
        be = (e, r) => {
          var a = 0,
            l = 0,
            v = 0;
          {
            var p = 2;
            (e == 0 ? (a = 2) : (e == 1 || e == 2) && (a = 64), (v = 1));
          }
          return (
            (C[r] = p),
            (X[(r + 2) >> 1] = v),
            (V[(r + 8) >> 3] = BigInt(a)),
            (V[(r + 16) >> 3] = BigInt(l)),
            0
          );
        },
        Ue = (e, r, a, l) => 52;
      function ke(e, r, a, l) {
        return 70;
      }
      var Ae = [null, [], []],
        Ce = (e, r) => {
          var a = Ae[e];
          r === 0 || r === 10
            ? ((e === 1 ? g : w)(Yt(a)), (a.length = 0))
            : a.push(r);
        },
        Re = (e, r, a, l) => {
          for (var v = 0, p = 0; p < a; p++) {
            var U = B[r >> 2],
              k = B[(r + 4) >> 2];
            r += 8;
            for (var $ = 0; $ < k; $++) Ce(e, z[U + $]);
            v += k;
          }
          return ((B[l >> 2] = v), 0);
        };
      (t.noExitRuntime && (lt = t.noExitRuntime),
        t.print && (g = t.print),
        t.printErr && (w = t.printErr),
        t.wasmBinary && (F = t.wasmBinary),
        t.arguments && t.arguments,
        t.thisProgram && (i = t.thisProgram));
      var Bt;
      function Ee(e) {
        ((t._hd_close = e.u),
          (t._hd_open = e.v),
          (t._hd_inbuf = e.w),
          (t._hd_send = e.x),
          (t._hd_receive = e.y),
          (t._hd_out_ptr = e.z),
          (t._hd_out_width = e.A),
          (t._hd_out_height = e.B),
          (t._hd_out_colorspace = e.C),
          (t._hd_out_fullrange = e.D),
          (t._hd_out_pts = e.E),
          (t._hd_flush = e.F),
          (t._hd_skip = e.G),
          (t._free = e.I),
          (t._malloc = e.J),
          (Bt = e.K));
      }
      t._ff_h264_cabac_tables = 85424;
      var Se = {
          j: xt,
          a: Zt,
          r: jt,
          o: te,
          g: ee,
          l: ne,
          m: oe,
          f: le,
          e: Ht,
          n: _e,
          c: ye,
          d: de,
          i: we,
          q: be,
          h: Ue,
          p: ke,
          b: Re,
          k: Pt,
        },
        x = await P();
      function gt() {
        if (R > 0) {
          I = gt;
          return;
        }
        if ((K(), R > 0)) {
          I = gt;
          return;
        }
        function e() {
          var r;
          ((t.calledRun = !0),
            !M &&
              (Q(),
              H == null || H(t),
              (r = t.onRuntimeInitialized) == null || r.call(t),
              ot()));
        }
        t.setStatus
          ? (t.setStatus("Running..."),
            setTimeout(() => {
              (setTimeout(() => t.setStatus(""), 1), e());
            }, 1))
          : e();
      }
      function Te() {
        if (t.preInit)
          for (
            typeof t.preInit == "function" && (t.preInit = [t.preInit]);
            t.preInit.length > 0;

          )
            t.preInit.shift()();
      }
      return (
        Te(),
        gt(),
        O
          ? (s = t)
          : (s = new Promise((e, r) => {
              ((H = e), (A = r));
            })),
        s
      );
    })(),
  Be = "/assets/hevcdec.e298f353.wasm";
function* it(n, s, t) {
  let i = s;
  for (; i + 8 <= t; ) {
    let o = n.getUint32(i);
    const f = String.fromCharCode(
      n.getUint8(i + 4),
      n.getUint8(i + 5),
      n.getUint8(i + 6),
      n.getUint8(i + 7),
    );
    let c = 8;
    if (o === 1) {
      if (i + 16 > t) return;
      ((o = n.getUint32(i + 8) * 2 ** 32 + n.getUint32(i + 12)), (c = 16));
    } else o === 0 && (o = t - i);
    if (o < c || i + o > t) return;
    (yield { type: f, start: i + c, end: i + o }, (i += o));
  }
}
function T(n, s, t) {
  for (const i of it(n, s.start, s.end)) if (i.type === t) return i;
  return null;
}
function zt(n, s, ...t) {
  let i = s;
  for (const o of t) {
    if (!i) return null;
    i = T(n, i, o);
  }
  return i;
}
function It(n) {
  const s = new DataView(n.buffer, n.byteOffset, n.byteLength),
    t = [];
  let i = 0;
  for (; i + 8 <= n.byteLength; ) {
    let o = s.getUint32(i);
    const f = String.fromCharCode(n[i + 4], n[i + 5], n[i + 6], n[i + 7]);
    if (o === 1) {
      if (i + 16 > n.byteLength) break;
      o = s.getUint32(i + 8) * 2 ** 32 + s.getUint32(i + 12);
    }
    if (o < 8) break;
    (t.push({ type: f, offset: i, size: o }), (i += o));
  }
  return t;
}
function Dt(n, s) {
  return n.getUint32(s) * 2 ** 32 + n.getUint32(s + 4);
}
function Fe(n, s) {
  return n.getInt32(s) * 2 ** 32 + n.getUint32(s + 4);
}
function Mt(n) {
  const s = new DataView(n.buffer, n.byteOffset, n.byteLength),
    t = it(s, 0, n.byteLength).next();
  if (t.done || t.value.type !== "moov") return null;
  const i = t.value;
  let o = 1e3;
  const f = T(s, i, "mvhd");
  f &&
    (o = s.getUint32(f.start + (s.getUint8(f.start) === 1 ? 20 : 12)) || 1e3);
  for (const c of it(s, i.start, i.end)) {
    if (c.type !== "trak") continue;
    const y = T(s, c, "mdia"),
      d = y && T(s, y, "hdlr");
    if (
      !y ||
      !d ||
      String.fromCharCode(
        s.getUint8(d.start + 8),
        s.getUint8(d.start + 9),
        s.getUint8(d.start + 10),
        s.getUint8(d.start + 11),
      ) !== "vide"
    )
      continue;
    const g = ze(s, c, y, o);
    if (g) return g;
  }
  return null;
}
function ze(n, s, t, i) {
  const o = T(n, t, "mdhd"),
    f = zt(n, t, "minf", "stbl");
  if (!o || !f) return null;
  const c = n.getUint8(o.start) === 1,
    y = n.getUint32(o.start + (c ? 20 : 12)) || 1,
    d = T(n, f, "stsd");
  if (!d) return null;
  const b = it(n, d.start + 8, d.end).next();
  if (b.done) return null;
  const g = b.value,
    w = g.type,
    F = w === "avc1" || w === "avc3";
  if (w !== "hvc1" && w !== "hev1" && !F) return null;
  const M = n.getUint16(g.start + 24),
    W = n.getUint16(g.start + 26);
  let H = null;
  for (const h of it(n, g.start + 78, g.end))
    h.type === (F ? "avcC" : "hvcC") &&
      (H = new Uint8Array(
        n.buffer,
        n.byteOffset + h.start,
        h.end - h.start,
      ).slice());
  if (!H) return null;
  const A = [],
    S = T(n, f, "stsz");
  if (S) {
    const h = n.getUint32(S.start + 4),
      u = n.getUint32(S.start + 8);
    for (let _ = 0; _ < u; _++) A.push(h || n.getUint32(S.start + 12 + _ * 4));
  }
  const C = A.length;
  if (!C) return null;
  const z = [],
    X = T(n, f, "stco"),
    B = T(n, f, "co64");
  if (X) {
    const h = n.getUint32(X.start + 4);
    for (let u = 0; u < h; u++) z.push(n.getUint32(X.start + 8 + u * 4));
  } else if (B) {
    const h = n.getUint32(B.start + 4);
    for (let u = 0; u < h; u++) z.push(Dt(n, B.start + 8 + u * 8));
  }
  const V = new Array(C),
    O = T(n, f, "stsc");
  if (!O || !z.length) return null;
  {
    const h = n.getUint32(O.start + 4),
      u = [];
    for (let m = 0; m < h; m++)
      u.push({
        first: n.getUint32(O.start + 8 + m * 12),
        per: n.getUint32(O.start + 12 + m * 12),
      });
    let _ = 0;
    for (let m = 0; m < u.length && _ < C; m++) {
      const D = m + 1 < u.length ? u[m + 1].first - 1 : z.length;
      for (let P = u[m].first; P <= D && _ < C; P++) {
        let E = z[P - 1];
        for (let et = 0; et < u[m].per && _ < C; et++)
          ((V[_] = E), (E += A[_]), _++);
      }
    }
    if (_ < C) return null;
  }
  const q = new Array(C),
    K = new Array(C),
    Q = T(n, f, "stts");
  if (!Q) return null;
  {
    const h = n.getUint32(Q.start + 4);
    let u = 0,
      _ = 0;
    for (let m = 0; m < h && u < C; m++) {
      const D = n.getUint32(Q.start + 8 + m * 8),
        P = n.getUint32(Q.start + 12 + m * 8);
      for (let E = 0; E < D && u < C; E++)
        ((q[u] = _), (K[u] = P), (_ += P), u++);
    }
    for (; u < C; u++)
      ((q[u] = u ? q[u - 1] + K[u - 1] : 0), (K[u] = u ? K[u - 1] : 0));
  }
  const ot = new Array(C).fill(0),
    R = T(n, f, "ctts");
  if (R) {
    const h = n.getUint8(R.start),
      u = n.getUint32(R.start + 4);
    let _ = 0;
    for (let m = 0; m < u && _ < C; m++) {
      const D = n.getUint32(R.start + 8 + m * 8),
        P =
          h === 1
            ? n.getInt32(R.start + 12 + m * 8)
            : n.getUint32(R.start + 12 + m * 8);
      for (let E = 0; E < D && _ < C; E++) ot[_++] = P;
    }
  }
  const I = T(n, f, "stss"),
    ft = new Set();
  if (I) {
    const h = n.getUint32(I.start + 4);
    for (let u = 0; u < h; u++) ft.add(n.getUint32(I.start + 8 + u * 4) - 1);
  }
  let ct = 0;
  const G = zt(n, s, "edts", "elst");
  if (G) {
    const h = n.getUint8(G.start),
      u = n.getUint32(G.start + 4);
    let _ = G.start + 8,
      m = 0;
    for (let D = 0; D < u; D++) {
      const P = h === 1 ? Dt(n, _) : n.getUint32(_),
        E = h === 1 ? Fe(n, _ + 8) : n.getInt32(_ + 4);
      if (((_ += h === 1 ? 20 : 12), E === -1)) {
        m += P / i;
        continue;
      }
      ct = m - E / y;
      break;
    }
  }
  const N = new Array(C);
  let tt = 0;
  for (let h = 0; h < C; h++) {
    const u = (q[h] + ot[h]) / y + ct,
      _ = K[h] / y;
    ((N[h] = {
      offset: V[h],
      size: A[h],
      pts: u,
      dur: _,
      key: I ? ft.has(h) : !0,
    }),
      u + _ > tt && (tt = u + _));
  }
  return { codec: w, width: M, height: W, hvcC: H, samples: N, duration: tt };
}
async function Ie(n) {
  let s = await n(0, 262144);
  for (let t = 0; t < 4; t++) {
    const i = It(s),
      o = i.find((g) => g.type === "moov");
    if (o) {
      let g;
      o.offset + o.size <= s.byteLength
        ? (g = s.subarray(o.offset, o.offset + o.size))
        : (g = await n(o.offset, o.offset + o.size));
      const w = Mt(g);
      if (!w)
        throw new Error(
          "\u6CA1\u6709\u627E\u5230 HEVC / H.264 \u89C6\u9891\u8F68",
        );
      return w;
    }
    const f = i[i.length - 1];
    if (!f) break;
    const c = f.offset + f.size,
      y = await n(c, c + 64 * 1024),
      d = It(y);
    if (!d.length) break;
    const b = d.find((g) => g.type === "moov");
    if (b) {
      const g = await n(c + b.offset, c + b.offset + b.size),
        w = Mt(g);
      if (!w)
        throw new Error(
          "\u6CA1\u6709\u627E\u5230 HEVC / H.264 \u89C6\u9891\u8F68",
        );
      return w;
    }
    s = y;
  }
  throw new Error("\u6CA1\u6709\u627E\u5230 moov");
}
const De = 1 << 20;
async function Vt(n, s, t) {
  let i;
  for (let o = 0; o < 3; o++)
    try {
      const f = await fetch(n, {
        headers: { Range: "bytes=" + s + "-" + (t - 1) },
      });
      if (!f.ok) throw new Error("HTTP " + f.status);
      const c = new Uint8Array(await f.arrayBuffer());
      return f.status === 200 && s > 0 ? c.subarray(s, t) : c;
    } catch (f) {
      ((i = f), await new Promise((c) => setTimeout(c, 300 * (o + 1))));
    }
  throw i;
}
class Me {
  constructor(s, t) {
    st(this, "buf", null);
    st(this, "bufStart", 0);
    st(this, "next", null);
    ((this.samples = s), (this.range = t));
  }
  span(s) {
    const t = this.samples,
      i = t[s].offset;
    let o = i + t[s].size,
      f = s + 1;
    for (
      ;
      f < t.length && t[f].offset >= i && t[f].offset + t[f].size - i <= De;

    )
      ((o = Math.max(o, t[f].offset + t[f].size)), f++);
    return { start: i, end: o, to: f };
  }
  load(s) {
    const t = this.span(s);
    return this.range(t.start, t.end).then((i) => ({
      start: t.start,
      data: i,
    }));
  }
  async read(s) {
    const t = this.samples[s];
    if (
      !this.buf ||
      t.offset < this.bufStart ||
      t.offset + t.size > this.bufStart + this.buf.byteLength
    ) {
      let o;
      (this.next && this.next.from === s
        ? (o = await this.next.p)
        : (o = await this.load(s)),
        (this.next = null),
        (this.buf = o.data),
        (this.bufStart = o.start));
      const f = this.span(s);
      if (f.to < this.samples.length) {
        const c = this.load(f.to);
        (c.catch(() => {}), (this.next = { from: f.to, p: c }));
      }
    }
    const i = t.offset - this.bufStart;
    return this.buf.subarray(i, i + t.size);
  }
}
const Ot = 6,
  We = 1.5,
  Wt = 1,
  vt = 2;
let Z = null,
  bt = "",
  j = null,
  L = 0,
  ut = 0,
  Y = 0,
  J = 0;
const mt = [];
let dt = null,
  wt = 0;
const at = (n, s) => self.postMessage(n, s || []);
function _t() {
  const n = dt;
  ((dt = null), n && n());
}
const qt = new MessageChannel(),
  Kt = [];
qt.port1.onmessage = () => {
  const n = Kt.shift();
  n && n();
};
function Ne() {
  return new Promise((n) => {
    (Kt.push(n), qt.port2.postMessage(0));
  });
}
function Ve() {
  return new Promise((n) => {
    dt = n;
  });
}
function Oe() {
  return Ie((n, s) => Vt(bt, n, s));
}
function qe(n) {
  const s = j.samples;
  let t = 0;
  for (
    let i = 0;
    i < s.length &&
    (s[i].key && s[i].pts <= n + 0.001 && (t = i), !(s[i].pts > n + 5));
    i++
  );
  return t;
}
function Ke(n, s) {
  const t = j.samples;
  for (let i = s + 1; i < t.length; i++) if (t[i].key && t[i].pts > n) return i;
  return -1;
}
function pt(n, s, t) {
  const i = Z;
  let o = -1;
  for (;;) {
    const f = i._hd_receive();
    if (f !== 1) {
      if (f === -3)
        throw new Error("\u4E0D\u652F\u6301\u7684\u50CF\u7D20\u683C\u5F0F");
      return o;
    }
    const c = i._hd_out_pts() / 1e6;
    if (((o = c), c < s - t * 1.01)) continue;
    const y = i._hd_out_width(),
      d = i._hd_out_height(),
      b = y * d + 2 * (y >> 1) * (d >> 1);
    let g = mt.pop();
    ((!g || g.byteLength !== b) && (g = new ArrayBuffer(b)),
      new Uint8Array(g).set(
        i.HEAPU8.subarray(i._hd_out_ptr(), i._hd_out_ptr() + b),
      ),
      Y++,
      at(
        {
          t: "frame",
          seq: n,
          pts: c,
          dur: t,
          w: y,
          h: d,
          cs: i._hd_out_colorspace(),
          full: i._hd_out_fullrange(),
          buf: g,
        },
        [g],
      ));
  }
}
async function Ge(n, s) {
  const t = j,
    i = Z,
    o = t.samples,
    f = new Me(o, (g, w) => Vt(bt, g, w));
  (i._hd_flush(), (J = 0), i._hd_skip(0));
  let c = qe(s),
    y = s;
  const d = o.length > 1 ? Math.max(0.001, t.duration / o.length) : 0.04;
  let b = o[c] ? o[c].pts - d * 2 : -1;
  for (; c < o.length; ) {
    if (n !== L) return;
    for (; Y >= Ot; ) if ((await Ve(), n !== L)) return;
    const g = b < y - d * 1.01;
    if (g) J !== vt && ((J = vt), i._hd_skip(J));
    else if (ut - b > We) {
      const A = Ke(ut, c);
      A > c && (i._hd_flush(), (c = A), (y = o[A].pts), (b = y - d * 2));
    }
    if (!g && b >= 0) {
      const A = ut - b,
        S = A > 0.5 ? Wt | vt : A > 0.15 ? Wt : A < 0.02 ? 0 : J;
      S !== J && ((J = S), i._hd_skip(S));
    }
    const w = await f.read(c);
    if (n !== L) return;
    const F = i._hd_inbuf(w.byteLength);
    i.HEAPU8.set(w, F);
    const M = Math.round(o[c].pts * 1e6);
    let W = i._hd_send(w.byteLength, M, o[c].key ? 1 : 0);
    if (W < 0) {
      const A = pt(n, y, d);
      (A >= 0 && (b = A), (W = i._hd_send(w.byteLength, M, o[c].key ? 1 : 0)));
    }
    const H = pt(n, y, d);
    (H >= 0 && (b = H), c++, (c & 1) === 0 && (await Ne()));
  }
  n === L && (i._hd_send(0, 0, 0), pt(n, y, d), at({ t: "end", seq: n }));
}
function Gt(n, s) {
  Ge(n, s).catch((t) => {
    n === L &&
      at({ t: "error", message: t instanceof Error ? t.message : String(t) });
  });
}
let Nt = 0,
  yt = null;
function $t() {
  return Z
    ? Promise.resolve()
    : (yt ||
        (yt = He({ locateFile: () => Be }).then((n) => {
          Z = n;
        })),
      yt);
}
async function $e(n, s, t) {
  const i = ++Nt;
  ((L = n), (wt = t), (bt = s), (j = null), (Y = 0), await $t());
  const o = await Oe();
  if (i !== Nt) return;
  if (!o.codec.startsWith("h"))
    throw new Error("\u6CA1\u6709\u627E\u5230 HEVC \u89C6\u9891\u8F68");
  j = o;
  const f = Z,
    c = f._malloc(o.hvcC.byteLength);
  f.HEAPU8.set(o.hvcC, c);
  const y = f._hd_open(c, o.hvcC.byteLength);
  if ((f._free(c), y < 0))
    throw new Error("\u6253\u5F00\u89E3\u7801\u5668\u5931\u8D25 (" + y + ")");
  (at({ t: "meta", width: o.width, height: o.height, duration: o.duration }),
    Gt(L, wt));
}
self.onmessage = (n) => {
  const s = n.data;
  switch (s.t) {
    case "init":
      $t().catch(() => {});
      break;
    case "open":
      $e(s.seq, s.url, s.at || 0).catch((t) => {
        s.seq <= L &&
          at({
            t: "error",
            message: t instanceof Error ? t.message : String(t),
          });
      });
      break;
    case "seek":
      ((L = s.seq), (wt = s.at), (Y = 0), _t(), j && Z && Gt(L, s.at));
      break;
    case "clock":
      ut = s.at;
      break;
    case "credit":
      (s.buf && mt.length < Ot && mt.push(s.buf),
        s.seq === L && Y > 0 && Y--,
        _t());
      break;
    case "close":
      (L++, _t(), self.close());
      break;
  }
};
