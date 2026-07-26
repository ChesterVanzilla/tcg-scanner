"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 2;
  const API_BASE = "https://api.tcgdex.net/v2";
  const CATALOG_CACHE_KEY = "carddex-v612-set-catalog";
  const DETAIL_CACHE_KEY = "carddex-v613-set-details";
  const PROJECTS_KEY = "carddex-v613-set-projects";
  const CATALOG_MAX_AGE = 24 * 60 * 60 * 1000;
  const DETAIL_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
  const DETAIL_CACHE_LIMIT = 8;
  let dbPromise = null;
  let catalogMemory = null;
  const detailMemory = new Map();

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Datenbankfehler"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Datenbankfehler"));
      transaction.onabort = () => reject(transaction.error || new Error("Datenbankvorgang abgebrochen"));
    });
  }

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", { keyPath: "id" });
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("collectionId", "collectionId", { unique: false });
          store.createIndex("cardId", "cardId", { unique: false });
        }
        if (!db.objectStoreNames.contains("scanHistory")) {
          const store = db.createObjectStore("scanHistory", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("cardId", "cardId", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden"));
      request.onblocked = () => reject(new Error("Die lokale Datenbank wird noch von einer älteren App-Version verwendet."));
    });
    return dbPromise;
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function readLocalCache(key, fallback) {
    try {
      return safeJsonParse(localStorage.getItem(key), fallback);
    } catch {
      return fallback;
    }
  }

  function writeLocalCache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Set-Cache konnte nicht gespeichert werden:", error);
    }
  }


  function getSetProjects() {
    const stored = readLocalCache(PROJECTS_KEY, []);
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.map(normalizeSetId).filter(Boolean))];
  }

  function replaceSetProjects(setIds = []) {
    const normalized = [...new Set((Array.isArray(setIds) ? setIds : []).map(normalizeSetId).filter(Boolean))];
    writeLocalCache(PROJECTS_KEY, normalized);
    window.CardDexCore?.emit?.("set-projects-changed", { setIds: normalized });
    return normalized;
  }

  function isSetProject(setId) {
    const clean = normalizeSetId(setId);
    return Boolean(clean && getSetProjects().includes(clean));
  }

  function setSetProject(setId, enabled = true) {
    const clean = normalizeSetId(setId);
    if (!clean) return false;
    const projects = new Set(getSetProjects());
    if (enabled) projects.add(clean);
    else projects.delete(clean);
    replaceSetProjects([...projects]);
    return projects.has(clean);
  }

  function toggleSetProject(setId) {
    return setSetProject(setId, !isSetProject(setId));
  }

  function normalizeSetId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeLocalId(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/^0+(?=\d)/, "");
  }

  function cardKey(setId, localId) {
    const set = normalizeSetId(setId);
    const number = normalizeLocalId(localId);
    return set && number ? `${set}::${number}` : "";
  }

  function assetUrl(value, format = "webp") {
    const url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) return "";
    if (/\.(?:webp|png|jpe?g|svg)(?:[?#].*)?$/i.test(url)) return url;
    return `${url}.${format}`;
  }

  function isFresh(timestamp, maxAge) {
    const time = Number(timestamp || 0);
    return Number.isFinite(time) && Date.now() - time < maxAge;
  }

  async function fetchJson(url, timeout = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWithLanguageFallback(path, language = "de") {
    const languages = [...new Set([language || "de", "de", "en"])];
    let lastError = null;
    for (const currentLanguage of languages) {
      try {
        const data = await fetchJson(`${API_BASE}/${encodeURIComponent(currentLanguage)}/${path}`);
        return { data, language: currentLanguage };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Set-Daten konnten nicht geladen werden.");
  }

  function normalizeSetBrief(set, language = "de") {
    return {
      id: String(set?.id || ""),
      name: String(set?.name || set?.id || "Unbekanntes Set"),
      logo: assetUrl(set?.logo),
      symbol: assetUrl(set?.symbol),
      language,
      cardCount: {
        total: Math.max(0, Number(set?.cardCount?.total || 0)),
        official: Math.max(0, Number(set?.cardCount?.official || 0))
      },
      releaseDate: String(set?.releaseDate || set?.release?.official || ""),
      serie: set?.serie ? {
        id: String(set.serie.id || ""),
        name: String(set.serie.name || "")
      } : null
    };
  }

  function compareCardNumbers(a, b) {
    const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    return collator.compare(String(a?.localId || ""), String(b?.localId || ""));
  }

  function normalizeSetCard(card, set, language = "de") {
    const localId = String(card?.localId || card?.number || "");
    const id = String(card?.id || `${set.id}-${localId || "unknown"}`);
    return {
      id,
      name: String(card?.name || "Unbekannte Karte"),
      localId,
      image: String(card?.image || ""),
      directImage: false,
      rarity: String(card?.rarity || ""),
      category: String(card?.category || ""),
      illustrator: String(card?.illustrator || ""),
      variants: card?.variants || null,
      setId: set.id,
      setName: set.name,
      officialTotal: set.cardCount.official || null,
      dataLanguage: language,
      _dataLanguage: language,
      source: "tcgdex",
      set: {
        id: set.id,
        name: set.name,
        logo: set.logo,
        symbol: set.symbol,
        cardCount: { ...set.cardCount }
      }
    };
  }

  async function getSetCatalog(language = "de", options = {}) {
    const force = Boolean(options.force);
    if (!force && catalogMemory?.data?.length && isFresh(catalogMemory.timestamp, CATALOG_MAX_AGE)) {
      return catalogMemory;
    }

    const cached = readLocalCache(CATALOG_CACHE_KEY, null);
    if (!force && cached?.data?.length && isFresh(cached.timestamp, CATALOG_MAX_AGE)) {
      catalogMemory = cached;
      return cached;
    }

    try {
      const result = await fetchWithLanguageFallback("sets", language);
      const data = Array.isArray(result.data)
        ? result.data.map(set => normalizeSetBrief(set, result.language)).filter(set => set.id)
        : [];
      data.sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
      const record = { timestamp: Date.now(), language: result.language, data };
      catalogMemory = record;
      writeLocalCache(CATALOG_CACHE_KEY, record);
      return record;
    } catch (error) {
      if (cached?.data?.length) {
        catalogMemory = cached;
        return { ...cached, stale: true, error: String(error?.message || error) };
      }
      throw error;
    }
  }

  function readDetailCache() {
    const cache = readLocalCache(DETAIL_CACHE_KEY, {});
    return cache && typeof cache === "object" ? cache : {};
  }

  function storeDetailCache(key, record) {
    const cache = readDetailCache();
    cache[key] = record;
    const entries = Object.entries(cache)
      .sort(([, a], [, b]) => Number(b?.timestamp || 0) - Number(a?.timestamp || 0))
      .slice(0, DETAIL_CACHE_LIMIT);
    writeLocalCache(DETAIL_CACHE_KEY, Object.fromEntries(entries));
  }

  async function getSetDetail(setId, language = "de", options = {}) {
    const cleanSetId = normalizeSetId(setId);
    if (!cleanSetId) throw new Error("Set-ID fehlt.");
    const cacheKey = `${language}:${cleanSetId}`;
    const force = Boolean(options.force);
    const memory = detailMemory.get(cacheKey);
    if (!force && memory?.data && isFresh(memory.timestamp, DETAIL_MAX_AGE)) return memory;

    const storedCache = readDetailCache();
    const cached = storedCache[cacheKey];
    if (!force && cached?.data && isFresh(cached.timestamp, DETAIL_MAX_AGE)) {
      detailMemory.set(cacheKey, cached);
      return cached;
    }

    try {
      const result = await fetchWithLanguageFallback(`sets/${encodeURIComponent(cleanSetId)}`, language);
      const set = normalizeSetBrief(result.data, result.language);
      const cards = Array.isArray(result.data?.cards)
        ? result.data.cards.map(card => normalizeSetCard(card, set, result.language)).sort(compareCardNumbers)
        : [];
      const data = { ...set, cards };
      const record = { timestamp: Date.now(), language: result.language, data };
      detailMemory.set(cacheKey, record);
      storeDetailCache(cacheKey, record);
      return record;
    } catch (error) {
      if (cached?.data) {
        detailMemory.set(cacheKey, cached);
        return { ...cached, stale: true, error: String(error?.message || error) };
      }
      throw error;
    }
  }

  async function getCollectionSnapshot() {
    const db = await openDatabase();
    const tx = db.transaction(["collections", "entries", "cards"], "readonly");
    const done = transactionDone(tx);
    const [collections, entries, cards] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("entries").getAll()),
      requestToPromise(tx.objectStore("cards").getAll())
    ]);
    await done;

    const collectionById = new Map(collections.map(collection => [collection.id, collection]));
    const cardById = new Map(cards.map(card => [card.id, card]));
    const ownedByKey = new Map();
    const wishlistByKey = new Map();
    const setMeta = new Map();

    entries.forEach(entry => {
      const collection = collectionById.get(entry.collectionId);
      const card = cardById.get(entry.cardId);
      if (!collection || !card) return;
      const setId = normalizeSetId(card.setId || card.set?.id || card._setBrief?.id);
      const localId = String(card.localId || "");
      const key = cardKey(setId, localId);
      if (!key) return;
      const quantity = Math.max(0, Number(entry.quantity || 0));
      const target = collection.type === "wishlist" ? wishlistByKey : ownedByKey;
      const current = target.get(key) || {
        key,
        setId,
        localId,
        quantity: 0,
        entries: [],
        card
      };
      current.quantity += quantity;
      current.entries.push({
        id: entry.id,
        collectionId: entry.collectionId,
        collectionName: collection.name,
        quantity,
        language: entry.language,
        variant: entry.variant
      });
      if (!current.card?.image && card.image) current.card = card;
      target.set(key, current);

      const existingMeta = setMeta.get(setId) || {
        id: setId,
        name: card.setName || card.set?.name || card._setBrief?.name || setId,
        logo: assetUrl(card.set?.logo || card._setBrief?.logo),
        symbol: assetUrl(card.set?.symbol || card._setBrief?.symbol),
        officialTotal: Math.max(0, Number(card.officialTotal || card.set?.cardCount?.official || card._setBrief?.cardCount?.official || 0)),
        total: Math.max(0, Number(card.set?.cardCount?.total || card._setBrief?.cardCount?.total || 0))
      };
      existingMeta.officialTotal = Math.max(existingMeta.officialTotal, Number(card.officialTotal || 0));
      setMeta.set(setId, existingMeta);
    });

    return { collections, entries, cards, ownedByKey, wishlistByKey, setMeta };
  }

  function buildSetSummary(set, snapshot) {
    const setId = normalizeSetId(set.id);
    const owned = [...snapshot.ownedByKey.values()].filter(item => item.setId === setId);
    const wishlist = [...snapshot.wishlistByKey.values()].filter(item => item.setId === setId);
    const ownedUnique = owned.length;
    const ownedCopies = owned.reduce((sum, item) => sum + item.quantity, 0);
    const duplicateCards = owned.filter(item => item.quantity > 1).length;
    const duplicateCopies = owned.reduce((sum, item) => sum + Math.max(0, item.quantity - 1), 0);
    const total = Math.max(0, Number(set.cardCount?.total || set.total || set.cardCount?.official || set.officialTotal || 0));
    const missing = total ? Math.max(0, total - ownedUnique) : 0;
    const progress = total ? Math.min(100, Math.round((ownedUnique / total) * 100)) : 0;
    return {
      ...set,
      id: setId,
      ownedUnique,
      ownedCopies,
      duplicateCards,
      duplicateCopies,
      wishlistCount: wishlist.length,
      total,
      missing,
      progress,
      complete: Boolean(total && ownedUnique >= total),
      project: isSetProject(setId)
    };
  }

  async function getSetOverview(options = {}) {
    const language = options.language || "de";
    const includeAll = Boolean(options.includeAll);
    const [snapshot, catalogResult] = await Promise.all([
      getCollectionSnapshot(),
      getSetCatalog(language, { force: Boolean(options.force) }).catch(error => ({ data: [], error: String(error?.message || error) }))
    ]);

    const catalogById = new Map((catalogResult.data || []).map(set => [normalizeSetId(set.id), set]));
    const setIds = includeAll
      ? new Set([...catalogById.keys(), ...snapshot.setMeta.keys()])
      : new Set(snapshot.setMeta.keys());

    const sets = [...setIds].map(setId => {
      const fallback = snapshot.setMeta.get(setId) || { id: setId, name: setId, officialTotal: 0, total: 0 };
      const catalog = catalogById.get(setId);
      const merged = catalog || {
        id: fallback.id,
        name: fallback.name,
        logo: fallback.logo || "",
        symbol: fallback.symbol || "",
        cardCount: { total: fallback.total || fallback.officialTotal || 0, official: fallback.officialTotal || 0 },
        language
      };
      return buildSetSummary(merged, snapshot);
    });

    const started = sets.filter(set => set.ownedUnique > 0);
    return {
      sets,
      catalogAvailable: Boolean(catalogResult.data?.length),
      stale: Boolean(catalogResult.stale),
      error: catalogResult.error || "",
      stats: {
        started: started.length,
        complete: started.filter(set => set.complete).length,
        missing: started.reduce((sum, set) => sum + set.missing, 0),
        duplicateCopies: started.reduce((sum, set) => sum + set.duplicateCopies, 0),
        projects: sets.filter(set => set.project).length,
        projectMissing: sets.filter(set => set.project).reduce((sum, set) => sum + set.missing, 0),
        projectWishlist: sets.filter(set => set.project).reduce((sum, set) => sum + set.wishlistCount, 0)
      }
    };
  }

  async function getSetProgress(setId, options = {}) {
    const language = options.language || "de";
    const [snapshot, detailResult] = await Promise.all([
      getCollectionSnapshot(),
      getSetDetail(setId, language, { force: Boolean(options.force) }).catch(error => ({ data: null, error: String(error?.message || error) }))
    ]);
    const cleanSetId = normalizeSetId(setId);
    const fallback = snapshot.setMeta.get(cleanSetId) || { id: cleanSetId, name: cleanSetId, total: 0, officialTotal: 0 };
    const set = detailResult.data || {
      id: cleanSetId,
      name: fallback.name,
      logo: fallback.logo || "",
      symbol: fallback.symbol || "",
      cardCount: { total: fallback.total || fallback.officialTotal || 0, official: fallback.officialTotal || 0 },
      cards: []
    };

    const cardsByKey = new Map();
    (set.cards || []).forEach(card => cardsByKey.set(cardKey(cleanSetId, card.localId), { ...card }));

    [...snapshot.ownedByKey.values()]
      .filter(item => item.setId === cleanSetId)
      .forEach(item => {
        const key = item.key;
        if (!cardsByKey.has(key)) {
          cardsByKey.set(key, {
            id: item.card.id,
            name: item.card.name,
            localId: item.localId,
            image: item.card.image || "",
            directImage: Boolean(item.card.directImage),
            rarity: item.card.rarity || "",
            category: item.card.category || "",
            setId: cleanSetId,
            setName: set.name,
            officialTotal: set.cardCount?.official || item.card.officialTotal || null,
            dataLanguage: item.card.dataLanguage || item.card._dataLanguage || language,
            source: item.card.source || "local",
            set: {
              id: cleanSetId,
              name: set.name,
              logo: set.logo,
              symbol: set.symbol,
              cardCount: { ...set.cardCount }
            },
            unlisted: true
          });
        }
      });

    const cards = [...cardsByKey.values()].sort(compareCardNumbers).map(card => {
      const key = cardKey(cleanSetId, card.localId);
      const owned = snapshot.ownedByKey.get(key) || null;
      const wishlist = snapshot.wishlistByKey.get(key) || null;
      return {
        ...card,
        key,
        ownedQuantity: owned?.quantity || 0,
        duplicateCopies: Math.max(0, Number(owned?.quantity || 0) - 1),
        ownedEntries: owned?.entries || [],
        wishlistQuantity: wishlist?.quantity || 0,
        wishlistEntries: wishlist?.entries || []
      };
    });

    const summary = buildSetSummary(set, snapshot);
    const missingCards = cards.filter(card => !card.ownedQuantity && !card.unlisted).length;
    return {
      set: { ...summary, missing: detailResult.data ? missingCards : summary.missing },
      cards,
      catalogAvailable: Boolean(detailResult.data),
      stale: Boolean(detailResult.stale),
      error: detailResult.error || ""
    };
  }

  function createWishlistCard(set, card) {
    return {
      id: String(card.id || `${set.id}-${card.localId}`),
      name: String(card.name || "Unbekannte Karte"),
      localId: String(card.localId || ""),
      image: String(card.image || ""),
      directImage: Boolean(card.directImage),
      rarity: String(card.rarity || ""),
      category: String(card.category || ""),
      illustrator: String(card.illustrator || ""),
      variants: card.variants || null,
      source: card.source || "tcgdex",
      dataLanguage: card.dataLanguage || card._dataLanguage || set.language || "de",
      _dataLanguage: card._dataLanguage || card.dataLanguage || set.language || "de",
      set: {
        id: set.id,
        name: set.name,
        logo: set.logo,
        symbol: set.symbol,
        cardCount: { ...set.cardCount }
      }
    };
  }

  async function init() {
    await openDatabase();
    window.CardDexCore?.emit?.("sets-ready", { version: window.CardDexCore?.version || "6.13" });
  }

  window.CardDexSetEngine = Object.freeze({
    init,
    getSetCatalog,
    getSetDetail,
    getSetOverview,
    getSetProgress,
    getCollectionSnapshot,
    createWishlistCard,
    getSetProjects,
    replaceSetProjects,
    isSetProject,
    setSetProject,
    toggleSetProject,
    normalizeSetId,
    normalizeLocalId,
    cardKey,
    assetUrl
  });
})();
