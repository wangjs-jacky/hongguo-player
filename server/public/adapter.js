(() => {
  const TTL = 120000;
  const STORE_KEY = ["hgplayer", "web", "v1"].join(".");
  const API_CACHE = new Map();
  const DETAIL_CACHE = new Map();
  const SERIES_CACHE = new Map();
  const DEMO_URL = "/media/demo.mp4";

  const emptyPage = (extra = {}) => ({ items: [], cursor: "", hasMore: false, ...extra });
  const unique = (items) => [...new Set(items)];
  const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  function readStore() {
    try {
      const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      return {
        favorites: Array.isArray(value.favorites) ? value.favorites : [],
        likes: Array.isArray(value.likes) ? value.likes : [],
        history: Array.isArray(value.history) ? value.history : [],
        reservations: Array.isArray(value.reservations) ? value.reservations : [],
        following: Array.isArray(value.following) ? value.following : [],
      };
    } catch {
      return { favorites: [], likes: [], history: [], reservations: [], following: [] };
    }
  }

  const store = readStore();
  const persist = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch {}
  };

  async function requestJson(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.success === false) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    return body;
  }

  async function json(url) {
    const now = Date.now();
    const cached = API_CACHE.get(url);
    if (cached && cached.expires > now) return cached.value;
    const pending = requestJson(url).then((value) => {
      API_CACHE.set(url, { value, expires: Date.now() + TTL });
      while (API_CACHE.size > 120) API_CACHE.delete(API_CACHE.keys().next().value);
      return value;
    });
    API_CACHE.set(url, { value: pending, expires: now + 4000 });
    try {
      return await pending;
    } catch (error) {
      API_CACHE.delete(url);
      throw error;
    }
  }

  async function seriesDetailRaw(id, fresh = false) {
    const key = String(id || "");
    if (!key) throw new Error("缺少剧集参数");
    const hit = DETAIL_CACHE.get(key);
    if (!fresh && hit && hit.expires > Date.now()) return hit.value;
    const value = json(`/api/series/${encodeURIComponent(key)}`).then((body) => body.series);
    DETAIL_CACHE.set(key, { value, expires: Date.now() + TTL });
    const series = await value;
    return series;
  }

  async function mapLimit(values, limit, mapper) {
    const output = new Array(values.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        output[index] = await mapper(values[index], index);
      }
    });
    await Promise.all(workers);
    return output;
  }

  function historyFor(id) {
    return store.history.find((item) => String(item.series?.id || item.seriesId) === String(id)) || null;
  }

  function kindFor(category) {
    if (category === "comic-drama") return "comic_series";
    if (category === "ai-drama") return "ai_series";
    return "shortplay";
  }

  function toEpisode(episode, index, series) {
    return {
      index: Math.max(0, number(episode.vid_index, index + 1) - 1),
      videoId: String(episode.vid || episode.videoId || ""),
      title: episode.title || "",
      duration: number(episode.duration),
      cover: episode.cover || series.cover || "",
      locked: false,
      commentCount: number(episode.comment_count),
      likeCount: number(episode.like_count),
      liked: false,
    };
  }

  function toSeries(item = {}, detail = null, category = "") {
    const info = detail || item || {};
    const id = String(info.series_id || info.id || item.series_id || item.id || "");
    const social = info.social_info || item.social_info || {};
    const history = historyFor(id);
    const favorite = store.favorites.some((entry) => String(entry.id) === id);
    const liked = store.likes.some((entry) => String(entry.id) === id);
    const cached = SERIES_CACHE.get(id);
    const episodeCount = number(info.total ?? info.episode_count ?? item.total ?? item.episode_count, 0)
      || (Array.isArray(info.episodes) ? info.episodes.length : 0);
    const series = {
      id,
      title: info.series_title || info.title || item.series_title || item.title || "",
      cover: info.cover || item.cover || "",
      intro: info.intro || info.description || item.description || "",
      tags: Array.isArray(info.tags || item.tags) ? unique(info.tags || item.tags) : [],
      episodeCount,
      score: number(social.rating ?? info.score ?? item.score, 0),
      status: info.episode_label || item.episode_label || "",
      playCount: number(social.like_count ?? info.play_count ?? item.play_count, 0),
      followCount: number(social.favorite_count ?? info.follow_count ?? item.follow_count, 0),
      favorited: favorite,
      liked,
      episodes: [],
      watchedEpisode: history ? number(history.episodeIndex, -1) + 1 : 0,
      serializing: /更新至|连载/.test(info.episode_label || ""),
      startVideoId: history?.videoId || "",
      startEpisode: 0,
      seasonIndex: 0,
      multiSeason: false,
      creators: (info.celebrities || []).map((person) => ({
        name: person.name || "",
        avatar: person.avatar || "",
        role: person.role || "演员",
        userId: String(person.actor_id || person.user_id || person.id || ""),
        canFollow: Boolean(person.can_follow),
        followed: Boolean(person.followed),
      })),
      recordNumber: info.record_number || item.record_number || "",
      hotText: social.hot_text || info.heat || item.heat || "",
      titleTag: info.title_tag || null,
      badge: info.badge || item.badge || "",
      heat: info.heat || item.heat || "",
      upcoming: Boolean(info.upcoming || item.upcoming),
      reserved: store.reservations.some((entry) => String(entry.seriesId) === id),
      rankText: item.rank ? `第${item.rank}名` : "",
      onlineTime: info.online_time || null,
      subInfo: info.sub_info || "",
      cast: (info.celebrities || []).map((person) => person.name).filter(Boolean),
      person: false,
      kind: info.kind || kindFor(category),
      followingUpdate: store.following.includes(id),
      updateFreq: info.update_freq || "",
      updatedAt: info.updated_at || null,
    };
    if (Array.isArray(info.episodes)) {
      series.episodes = info.episodes.map((episode, index) => toEpisode(episode, index, series));
      series.startVideoId ||= series.episodes[0]?.videoId || "";
    }
    if (cached) {
      if (!series.episodes.length) series.episodes = cached.episodes || [];
      if (!series.startVideoId) series.startVideoId = cached.startVideoId || "";
      if (!series.creators.length) series.creators = cached.creators || [];
    }
    SERIES_CACHE.set(id, series);
    return series;
  }

  function toSeriesFromCard(item, category = "") {
    const id = String(item.series_id || item.id || "");
    const cached = SERIES_CACHE.get(id);
    if (cached) {
      return {
        ...cached,
        favorited: store.favorites.some((entry) => String(entry.id) === id),
        liked: store.likes.some((entry) => String(entry.id) === id),
      };
    }
    return toSeries(item, null, category);
  }

  function pageState(data, page, limit) {
    const all = Array.isArray(data.results) ? data.results : [];
    const results = all.slice(0, limit);
    const hasMore = Boolean(data.hasMore || data.has_more || number(data.totalPages) > page);
    return { results, hasMore, page };
  }

  async function catalogPage(category, page, genre = "", limit = 20) {
    const query = new URLSearchParams({
      category: category || "hot-drama",
      page: String(page),
    });
    if (genre) query.set("genre", genre);
    return pageState(await json(`/api/catalog?${query}`), page, limit);
  }

  function categoryForFilters(filters = {}) {
    const values = (key) => {
      const value = filters[key];
      return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    };
    const category = values("category").find((value) => ["hot-drama", "real-drama", "comic-drama", "ai-drama"].includes(value));
    const genre = values("genre");
    if (category) {
      return {
        category,
        genre: genre.find((value) => !["comic_series", "ai_series", "shortplay"].includes(value)) || "",
      };
    }
    if (genre.includes("comic_series")) return { category: "comic-drama", genre: "" };
    if (genre.includes("ai_series")) return { category: "ai-drama", genre: "" };
    if (genre.includes("shortplay")) return { category: "real-drama", genre: "" };
    return { category: "hot-drama", genre: genre[0] || "" };
  }

  async function categoryPage(filters, cursor) {
    const { category, genre } = categoryForFilters(filters);
    const page = Math.max(1, number(cursor, 1));
    const data = await catalogPage(category, page, genre, 20);
    return {
      items: data.results.map((item) => toSeriesFromCard(item, category)),
      cursor: data.hasMore ? String(page + 1) : "",
      hasMore: data.hasMore,
    };
  }

  async function searchPage(query, cursor) {
    const page = Math.max(1, number(cursor, 1));
    const text = String(query || "").trim();
    if (!text) return { items: [], cursor: "", hasMore: false };
    const body = await json(`/api/search?q=${encodeURIComponent(text)}&page=${page}`);
    const results = Array.isArray(body.results) ? body.results : [];
    return {
      items: results.map((item) => toSeriesFromCard(item)),
      cursor: body.hasMore ? String(page + 1) : "",
      hasMore: Boolean(body.hasMore),
    };
  }

  async function searchSuggest(query) {
    const text = String(query || "").trim();
    if (!text) return [];
    const body = await json(`/api/search?q=${encodeURIComponent(text)}&page=1`).catch(() => ({ results: [] }));
    return (body.results || []).slice(0, 10).map((item) => {
      const title = String(item.series_title || "");
      const at = title.toLowerCase().indexOf(text.toLowerCase());
      const parts = at < 0
        ? [{ text: title, hl: false }]
        : [
            ...(at > 0 ? [{ text: title.slice(0, at), hl: false }] : []),
            { text: title.slice(at, at + text.length), hl: true },
            ...(at + text.length < title.length ? [{ text: title.slice(at + text.length), hl: false }] : []),
          ];
      return {
        word: title,
        parts,
        seriesId: String(item.series_id || ""),
        cover: item.cover || "",
        abstract: item.description || (Array.isArray(item.tags) ? item.tags.join(" · ") : ""),
        upcoming: false,
      };
    });
  }

  async function recommendFeed(cursor) {
    const page = Math.max(1, number(cursor, 1));
    const data = await catalogPage("hot-drama", page, "", 12);
    const details = await mapLimit(data.results, 4, (item) => seriesDetailRaw(item.series_id).catch(() => null));
    const offset = (page - 1) * 12;
    return {
      items: data.results.map((item, index) => {
        const series = toSeries(item, details[index], "hot-drama");
        const episode = series.episodes[0] || {
          index: 0,
          videoId: String(series.id || "1"),
          title: "",
          duration: 0,
          cover: series.cover,
          locked: false,
          commentCount: 0,
          likeCount: 0,
          liked: false,
        };
        return {
          series,
          episode,
          rank: offset + index + 1,
          rankHot: series.heat || series.hotText || "",
          reasons: [],
          recInfo: "",
          dislike: [],
          dislikeCard: 0,
        };
      }),
      cursor: data.hasMore ? String(page + 1) : "",
      hasMore: data.hasMore,
    };
  }

  function savedSeriesList(entries, cursor, limit = 30) {
    const page = Math.max(1, number(cursor, 1));
    const items = entries.slice((page - 1) * limit, page * limit).map((entry) => {
      const series = SERIES_CACHE.get(String(entry.id)) || entry;
      return {
        ...series,
        favorited: store.favorites.some((value) => String(value.id) === String(entry.id)),
        liked: store.likes.some((value) => String(value.id) === String(entry.id)),
      };
    });
    return {
      items,
      cursor: page * limit < entries.length ? String(page + 1) : "",
      hasMore: page * limit < entries.length,
    };
  }

  async function ensureSeries(id) {
    const key = String(id || "");
    const cached = SERIES_CACHE.get(key);
    if (cached?.episodes?.length) return cached;
    const detail = await seriesDetailRaw(key);
    return toSeries(detail, detail);
  }

  async function setFavorite(id, value) {
    const series = await ensureSeries(id);
    series.favorited = Boolean(value);
    const next = store.favorites.filter((entry) => String(entry.id) !== String(id));
    if (value) next.unshift({ ...series, favorited: true });
    store.favorites = next;
    persist();
    return true;
  }

  async function setLike(id, videoId, value) {
    const series = await ensureSeries(id);
    series.liked = Boolean(value);
    if (value) series.startVideoId = series.startVideoId || String(videoId || "");
    const next = store.likes.filter((entry) => String(entry.id) !== String(id));
    if (value) next.unshift({ ...series, liked: true, startVideoId: series.startVideoId || String(videoId || "") });
    store.likes = next;
    persist();
    return true;
  }

  async function saveProgress(seriesValue, episodeIndex, videoId, positionSec) {
    const series = seriesValue?.id
      ? toSeries(seriesValue, seriesValue)
      : await ensureSeries(seriesValue);
    const index = Math.max(0, number(episodeIndex, 0));
    const at = Math.max(0, number(positionSec, 0));
    series.watchedEpisode = index + 1;
    series.startVideoId = String(videoId || series.startVideoId || series.episodes[0]?.videoId || "");
    SERIES_CACHE.set(String(series.id), series);
    const next = store.history.filter((entry) => String(entry.series?.id) !== String(series.id));
    if (at >= 1) {
      next.unshift({
        series: { ...series },
        episodeIndex: index,
        videoId: series.startVideoId,
        positionSec: at,
        updatedAt: Date.now(),
      });
    }
    store.history = next;
    persist();
    return true;
  }

  function historyPage(cursor) {
    const limit = 30;
    const page = Math.max(1, number(cursor, 1));
    const slice = store.history.slice((page - 1) * limit, page * limit);
    return {
      items: slice.map((entry) => ({
        ...entry,
        series: SERIES_CACHE.get(String(entry.series?.id)) || entry.series,
      })),
      cursor: page * limit < store.history.length ? String(page + 1) : "",
      hasMore: page * limit < store.history.length,
    };
  }

  function localProgress(ids) {
    const wanted = Array.isArray(ids) ? ids.map(String) : String(ids || "").split(",").filter(Boolean);
    const output = {};
    for (const id of wanted) {
      const entry = historyFor(id);
      if (entry) {
        output[String(id)] = {
          episodeIndex: number(entry.episodeIndex, 0),
          videoId: entry.videoId || "",
          positionSec: number(entry.positionSec, 0),
        };
      }
    }
    return output;
  }

  async function playInfo(seriesId, videoId) {
    const id = String(seriesId || "");
    const vid = String(videoId || "");
    const resume = historyFor(id);
    const fallback = {
      videoId: vid,
      duration: 100.101,
      qualities: [{
        name: "自动",
        width: 1080,
        height: 1920,
        url: new URL(DEMO_URL, location.origin).href,
        codec: "h264",
      }],
      default: "自动",
      resumeSec: resume?.videoId === vid ? number(resume.positionSec, 0) : 0,
      thumbs: null,
      loudness: null,
    };
    try {
      const hevc = (() => {
        try {
          const probe = document.createElement("video");
          return !!(probe.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"')
            || probe.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'));
        } catch {
          return false;
        }
      })();
      const session = await fetch("/api/session", { method: "POST", credentials: "same-origin" });
      if (!session.ok) throw new Error("session");
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12000);
      let body;
      try {
        const response = await fetch("/api/play", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seriesId: id, vid, quality: "auto", compatible: !hevc }),
          signal: controller.signal,
        });
        body = await response.json();
        if (!response.ok || body.success === false) throw new Error(body.error || "播放失败");
      } finally {
        window.clearTimeout(timer);
      }
      if (body.mode !== "stream" || !body.url) return fallback;
      return {
        videoId: vid,
        duration: number(body.duration, fallback.duration),
        qualities: [{
          name: String(body.codec || "auto").toUpperCase(),
          width: number(body.width, 1080),
          height: number(body.height, 1920),
          url: new URL(body.url, location.origin).href,
          codec: body.codec || "h264",
        }],
        default: String(body.codec || "auto").toUpperCase(),
        resumeSec: fallback.resumeSec,
        thumbs: null,
        loudness: null,
      };
    } catch {
      return fallback;
    }
  }

  async function feedCategories() {
    let genres = [];
    try {
      const data = await json("/api/catalog?category=real-drama&page=1");
      genres = (data.genres || []).map((item) => ({ id: item.slug, name: item.label }));
    } catch {}
    return [
      {
        key: "category",
        name: "全部频道",
        options: [
          { id: "hot-drama", name: "推荐" },
          { id: "real-drama", name: "真人短剧" },
          { id: "comic-drama", name: "漫剧" },
          { id: "ai-drama", name: "AI短剧" },
        ],
      },
      { key: "genre", name: "全部题材", options: genres },
      {
        key: "sort",
        name: "排序",
        options: [
          { id: "hot", name: "热度" },
          { id: "new", name: "最新" },
        ],
      },
    ];
  }

  function rankPanel() {
    const panel = [{
      key: "audience",
      name: "受众",
      options: [
        { id: "", name: "全部" },
        { id: "female", name: "女频" },
        { id: "male", name: "男频" },
      ],
    }];
    return [
      { id: "hot", name: "热播榜", subs: [{ id: "all", name: "总榜", desc: "", panel }] },
      { id: "real", name: "真人剧", subs: [{ id: "all", name: "总榜", desc: "", panel }] },
      { id: "comic", name: "漫剧", subs: [{ id: "all", name: "总榜", desc: "", panel }] },
      { id: "ai", name: "AI剧", subs: [{ id: "all", name: "总榜", desc: "", panel }] },
    ];
  }

  async function rankingPage(filters, cursor) {
    const rank = String(filters?.rank || "hot");
    const category = { hot: "hot-drama", real: "real-drama", comic: "comic-drama", ai: "ai-drama" }[rank] || "hot-drama";
    const page = Math.max(1, number(cursor, 1));
    const data = await catalogPage(category, page, "", 20);
    return {
      items: data.results.map((item, index) => {
        const series = toSeriesFromCard(item, category);
        series.rankText = `第${(page - 1) * 20 + index + 1}名`;
        return series;
      }),
      cursor: data.hasMore ? String(page + 1) : "",
      hasMore: data.hasMore,
    };
  }

  async function newSeriesPage(tabType, cursor) {
    const types = { 2: "hot-drama", 1: "real-drama", 0: "comic-drama" };
    const category = types[String(tabType)] || "hot-drama";
    const page = Math.max(1, number(cursor, 1));
    const data = await catalogPage(category, page, "", 20);
    return {
      items: data.results.map((item) => toSeriesFromCard(item, category)),
      cursor: data.hasMore ? String(page + 1) : "",
      hasMore: data.hasMore,
    };
  }

  function compactDate(date) {
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  }

  async function calendarPage(dateValue, kind, cursor) {
    const today = new Date();
    const dates = Array.from({ length: 9 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index - 2);
      return compactDate(date);
    });
    const date = String(dateValue || compactDate(today));
    const category = kind === "comic_series" ? "comic-drama" : kind === "shortplay" ? "real-drama" : "hot-drama";
    const data = await catalogPage(category, Math.max(1, number(cursor, 1)), "", 12);
    return {
      items: data.results.map((item, index) => ({
        seriesId: String(item.series_id),
        itemId: String(item.series_id),
        title: item.series_title || "",
        cover: item.cover || "",
        intro: item.description || "",
        category: "",
        episodeCount: number(item.total || item.episode_count),
        online: true,
        subscribed: false,
        expectedPublishTime: Math.floor(today.getTime() / 1000) + index * 3600,
        schedulePublishTime: Math.floor(today.getTime() / 1000) + index * 3600,
        hint: "",
        note: "",
        badge: "",
        kind,
      })),
      cursor: data.hasMore ? String(number(cursor, 1) + 1) : "",
      hasMore: data.hasMore,
      dates,
      date,
      today: compactDate(today),
    };
  }

  function reservationPage(cursor, onlineOnly) {
    const page = Math.max(1, number(cursor, 1));
    const limit = 30;
    const all = store.reservations.filter((item) => onlineOnly === undefined || Boolean(item.online) === onlineOnly);
    const items = all.slice((page - 1) * limit, page * limit);
    return {
      items,
      cursor: page * limit < all.length ? String(page + 1) : "",
      hasMore: page * limit < all.length,
      onlineTotal: store.reservations.filter((item) => item.online).length,
      offlineTotal: store.reservations.filter((item) => !item.online).length,
    };
  }

  function messagesPage(type) {
    return emptyPage({
      tabs: [
        { type: Number(type) || 10, title: "全部", unread: 0 },
        { type: 2, title: "评论和弹幕", unread: 0 },
        { type: 3, title: "赞和收藏", unread: 0 },
      ],
    });
  }

  async function relatedSeries(id) {
    const reveal = (item) => toSeriesFromCard(item, "hot-drama");
    try {
      const data = await catalogPage("hot-drama", 1, "", 16);
      const values = data.results.map(reveal).filter((item) => item.id !== String(id));
      return { works: values.slice(0, 8), guess: values.slice(8, 16) };
    } catch {
      return { works: [], guess: [] };
    }
  }

  function seriesPage(items, cursor = "", hasMore = false) {
    return { items, cursor, hasMore };
  }

  const handlers = {
    Status: () => ({
      starting: false,
      ready: true,
      error: "",
      account: { loggedIn: false, userId: "", nickname: "", avatar: "" },
      device: { ready: true, registering: false, error: "" },
    }),
    AppInfo: () => ({
      version: "1.2.32",
      commit: "web",
      platform: "web",
      installId: "hongguo-web",
      updateEnabled: false,
    }),
    FeedCategories: feedCategories,
    RecommendTab: (_tab, cursor) => recommendFeed(cursor),
    Category: categoryPage,
    Search: (query, cursor) => searchPage(query, cursor),
    SearchSuggest: searchSuggest,
    SelectorPanel: async (category) => {
      const data = await json(`/api/catalog?category=${encodeURIComponent(category || "real-drama")}&page=1`).catch(() => ({}));
      return data.genres || [];
    },
    SeriesDetail: async (id) => {
      const detail = await seriesDetailRaw(id);
      return toSeries(detail, detail);
    },
    PlayInfo: playInfo,
    RankPanel: rankPanel,
    Rank: rankingPage,
    NewSeries: newSeriesPage,
    Calendar: calendarPage,
    CalendarUpcoming: (_kind, cursor) => reservationPage(cursor, false),
    Favorites: (cursor) => savedSeriesList(store.favorites, cursor),
    Likes: (cursor) => savedSeriesList(store.likes, cursor),
    History: historyPage,
    Reservations: (_tab, cursor) => reservationPage(cursor),
    SetReservation: async (seriesId, value) => {
      const series = await ensureSeries(seriesId);
      const next = store.reservations.filter((item) => String(item.seriesId) !== String(seriesId));
      if (value) {
        next.unshift({
          seriesId: String(seriesId),
          itemId: String(seriesId),
          title: series.title,
          cover: series.cover,
          intro: series.intro,
          category: "",
          episodeCount: series.episodeCount,
          online: !series.upcoming,
          subscribed: true,
          expectedPublishTime: 0,
          schedulePublishTime: 0,
          hint: "",
          note: "",
          badge: "",
          kind: series.kind,
        });
      }
      store.reservations = next;
      persist();
      return true;
    },
    DeleteReservations: (seriesIds) => {
      const wanted = new Set((seriesIds || []).map(String));
      store.reservations = store.reservations.filter((item) => !wanted.has(String(item.seriesId)));
      persist();
      return true;
    },
    SetFavorite: setFavorite,
    RemoveFavorites: (ids) => {
      const wanted = new Set((ids || []).map(String));
      store.favorites = store.favorites.filter((item) => !wanted.has(String(item.id)));
      persist();
      return true;
    },
    SetLike: setLike,
    RemoveLikes: (refs) => {
      const removed = Array.isArray(refs) ? refs : [];
      const keys = new Set(removed.map((item) => `${item.seriesId}/${item.videoId || ""}`));
      store.likes = store.likes.filter((item) => !keys.has(`${item.id}/${item.startVideoId || ""}`));
      persist();
      return { removed, failed: 0, error: "" };
    },
    SaveProgress: saveProgress,
    LocalProgress: localProgress,
    LocalPending: () => ({ favorites: store.favorites.length, likes: store.likes.length }),
    DeleteHistory: (refs) => {
      const ids = new Set((refs || []).map((item) => String(item.seriesId)));
      store.history = store.history.filter((item) => !ids.has(String(item.series?.id)));
      persist();
      return true;
    },
    IsFollowingUpdate: (id) => store.following.includes(String(id)),
    SetFollowUpdate: (id, value) => {
      const next = new Set(store.following);
      if (value) next.add(String(id));
      else next.delete(String(id));
      store.following = [...next];
      persist();
      return true;
    },
    FollowUpdates: (cursor) => {
      const entries = store.following.map((id) => SERIES_CACHE.get(id)).filter(Boolean);
      return savedSeriesList(entries, cursor);
    },
    FollowUser: () => true,
    Messages: messagesPage,
    MessageUnread: () => ({ total: 0, mention: 0, comment: 0, like: 0 }),
    Notices: () => [],
    CheckNotices: () => ({ notice: "" }),
    MarkNoticesRead: () => true,
    ClearNotices: () => true,
    Downloads: () => [],
    DeleteDownloads: () => true,
    FolderItemIDs: () => [],
    Folders: () => [],
    Emoticons: () => emptyPage({ nextOffset: 0 }),
    UserFavorites: () => emptyPage(),
    UserLikes: () => emptyPage(),
    UserProfile: async (id) => {
      const data = await json(`/api/actors/${encodeURIComponent(id)}`);
      const actor = data.actor || {};
      return {
        userId: String(actor.actor_id || id),
        name: actor.name || "",
        avatar: actor.avatar || "",
        description: actor.intro || "",
        role: "演员",
        hongguoId: String(actor.actor_id || id),
        badges: [],
        honors: [],
        verified: actor.celebrity_type === 1,
        followCount: 0,
        fansCount: 0,
        likedCount: 0,
        canFollow: false,
        followed: false,
        followsMe: false,
        tabs: [{ type: "works", name: "作品", total: 0, private: false, sub: [] }],
      };
    },
    UserWorks: async (id, cursor) => {
      const page = Math.max(1, number(cursor, 1));
      const offset = (page - 1) * 20;
      const data = await json(`/api/actors/${encodeURIComponent(id)}/works?offset=${offset}`);
      const works = (data.works || []).map((item) => toSeriesFromCard({
        ...item,
        series_id: item.series_id,
        series_title: item.series_title,
        cover: item.cover,
        total: item.episode_count,
        score: item.score,
        description: item.description,
        heat: item.rec_text,
      }));
      return seriesPage(works, data.has_more ? String(page + 1) : "", Boolean(data.has_more));
    },
    Related: relatedSeries,
    SeriesSeasons: () => [],
    NextSeason: () => null,
    Reviews: () => emptyPage({ total: 0, score: 0, scoreCount: 0, tags: [] }),
    Comments: () => emptyPage({ total: 0, offline: false, savedAt: "" }),
    Danmaku: () => ({ items: [], nextMs: 0 }),
    Replies: () => emptyPage(),
    ReviewReplies: () => emptyPage(),
    PrefetchAhead: () => true,
    PrefetchPlay: () => true,
    PrefetchPlayItems: () => true,
    NativeDecPrepare: () => true,
    NativeDecOpen: () => true,
    NativeDecClose: () => true,
    NativeDecSeek: () => true,
    NativeDecPreload: () => true,
    NativeDecCatchUp: () => true,
    NativeDecSetCPUOnly: () => true,
    NativeDecStatus: () => ({ active: false, state: "idle", width: 0, height: 0, dropped: 0, frames: 0 }),
    HEVCStatus: () => ({ available: true, ffmpeg: true, gpu: false, reason: "" }),
    HEVCDiag: () => ({ available: true, mode: "web", reason: "", detail: "" }),
    DiagnoseLocalPlay: () => ({
      proxyAddr: "",
      proxySelfOk: true,
      firewallOn: false,
      firewallProfiles: [],
      blockRules: [],
      allowRule: "",
      security: "",
      exePath: "",
      canOpenFirewall: false,
      loopbackProxied: false,
      systemProxy: false,
    }),
    RemoteConfig: () => ({}),
    UpdateState: () => ({
      version: "1.2.32",
      enabled: false,
      checking: false,
      lastCheck: "",
      error: "",
      available: null,
      downgrade: false,
      force: false,
      min: "",
      phase: "idle",
      progress: 0,
      canApply: false,
      manualReason: "",
      manualUrl: "",
      downloadPage: "",
      notice: null,
      disabled: null,
      lastResult: "",
    }),
    CheckUpdate: () => null,
    GetCustomDevice: () => ({ did: "", uid: "", iid: "" }),
    SetCustomDevice: (did, uid, iid) => ({ did: did || "", uid: uid || "", iid: iid || "" }),
    GetDataDirInfo: () => ({
      dir: "/downloads",
      defaultDir: "/downloads",
      isDefault: true,
      totalBytes: 0,
      cacheBytes: 0,
      cacheLimit: 0,
      canClearCache: true,
      canRestart: false,
      notice: "",
    }),
    GetWebviewGPU: () => ({ mode: "web", active: "default", options: [] }),
    GetWindowRect: () => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }),
    GetWorkArea: () => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }),
    LoginRegions: () => [],
    QRLoginStart: () => ({ token: "web", image: "", expireAt: 0 }),
    QRLoginPoll: () => ({ state: "waiting", account: null }),
    QRLoginCancel: () => true,
    SendCode: () => true,
    Login: () => true,
    Logout: () => true,
    ClipboardSeq: () => "",
    ShareLink: (seriesId, videoId) => {
      const series = SERIES_CACHE.get(String(seriesId));
      return {
        link: `${location.origin}/#/play/${seriesId}/${videoId || ""}`,
        seriesId: String(seriesId || ""),
        videoId: String(videoId || ""),
        title: series?.title || "",
        cover: series?.cover || "",
        episodeIndex: 0,
        episodeCount: series?.episodeCount || 0,
        serializing: false,
      };
    },
    ResolveShare: () => null,
    About: () => ({
      author: "hongguo-player",
      email: "",
      qq: "",
      note: "",
      qr: "",
      qrAlipay: "",
    }),
    ReportEnv: () => true,
    ReportError: () => true,
    Integrity: () => "",
    KeepAwake: () => true,
    NoteFeed: () => true,
    Dislike: () => true,
    DismissDataDirNotice: () => true,
  };

  const noops = [
    "AddDownloads",
    "ApplyUpdate",
    "ClearCache",
    "CollectEmoticon",
    "CreateFolder",
    "DeleteComment",
    "DeleteFolders",
    "DownloadSeries",
    "DownloadUpdate",
    "FixFirewall",
    "FixLoopbackProxy",
    "HideToTray",
    "LikeComment",
    "LikeDanmaku",
    "LikeReview",
    "MoveDataDir",
    "OpenDownloadDir",
    "OpenFirewallSettings",
    "PauseDownloads",
    "ResumeDownloads",
    "RetryDeviceRegister",
    "SetBossKey",
    "SetDownloadWorkers",
    "SetPlaybackPrefs",
    "SetTray",
    "SetUIZoom",
    "SetWebviewGPU",
    "SetWindowButtonsVisible",
    "SetWindowMode",
    "SetWindowOpacity",
    "SetWindowRect",
    "StealthStart",
    "StealthStop",
    "UploadLocal",
    "UploadPicture",
  ];
  for (const name of noops) handlers[name] ||= () => true;

  window.__wailsData = async (name, args) => {
    const method = String(name).replace(/^app\.App\./, "");
    const handler = handlers[method];
    if (!handler) return null;
    return handler(...(args || []));
  };
})();
