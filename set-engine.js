"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 2;
  const API_BASE = "https://api.tcgdex.net/v2";
  const CATALOG_CACHE_KEY = "carddex-v614-set-catalog";
  const DETAIL_CACHE_KEY = "carddex-v614-set-details";
  const PROJECTS_KEY = "carddex-v613-set-projects";
  const PROJECT_SETTINGS_KEY = "carddex-v614-set-project-settings";
  const PROJECT_PROGRESS_KEY = "carddex-v614-set-project-progress";
  const PROJECT_GOALS = new Set(["numbers", "normal-reverse", "master"]);
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

  function readProjectProgressCache() {
    const stored = readLocalCache(PROJECT_PROGRESS_KEY, {});
    return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  }

  function storeProjectProgress(setId, progress) {
    const clean = normalizeSetId(setId);
    if (!clean || !progress) return;
    const cache = readProjectProgressCache();
    cache[clean] = {
      goal: normalizeProjectGoal(progress.goal),
      target: Math.max(0, Number(progress.target || 0)),
      owned: Math.max(0, Number(progress.owned || 0)),
      missing: Math.max(0, Number(progress.missing || 0)),
      progress: Math.max(0, Math.min(100, Number(progress.progress || 0))),
      complete: Boolean(progress.complete),
      updatedAt: Date.now()
    };
    writeLocalCache(PROJECT_PROGRESS_KEY, cache);
  }

  function normalizeProjectGoal(value) {
    return PROJECT_GOALS.has(String(value || "")) ? String(value) : "numbers";
  }

  function getAllProjectSettings() {
    const stored = readLocalCache(PROJECT_SETTINGS_KEY, {});
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).map(([setId, settings]) => [
      normalizeSetId(setId),
      { goal: normalizeProjectGoal(settings?.goal) }
    ]).filter(([setId]) => Boolean(setId)));
  }

  function replaceAllProjectSettings(settings = {}) {
    const normalized = {};
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      Object.entries(settings).forEach(([setId, value]) => {
        const clean = normalizeSetId(setId);
        if (clean) normalized[clean] = { goal: normalizeProjectGoal(value?.goal) };
      });
    }
    writeLocalCache(PROJECT_SETTINGS_KEY, normalized);
    window.CardDexCore?.emit?.("set-project-settings-changed", { settings: normalized });
    return normalized;
  }

  function getProjectSettings(setId) {
    const clean = normalizeSetId(setId);
    return getAllProjectSettings()[clean] || { goal: "numbers" };
  }

  function setProjectSettings(setId, updates = {}) {
    const clean = normalizeSetId(setId);
    if (!clean) return { goal: "numbers" };
    const all = getAllProjectSettings();
    all[clean] = { ...getProjectSettings(clean), goal: normalizeProjectGoal(updates.goal) };
    replaceAllProjectSettings(all);
    return all[clean];
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

  function normalizeVariant(value) {
    const clean = String(value || "normal");
    const aliases = {
      reverseHolo: "reverse",
      reverse_holo: "reverse",
      first_edition: "firstEdition",
      firstedition: "firstEdition",
      promo: "wPromo"
    };
    return aliases[clean] || clean;
  }

  function variantLabel(value) {
    return ({
      normal: "Normal",
      holo: "Holo",
      reverse: "Reverse Holo",
      firstEdition: "1. Auflage",
      wPromo: "Promo-Variante",
      other: "Sonstige Variante"
    })[normalizeVariant(value)] || "Normal";
  }

  function availableVariantKeys(card) {
    const variants = card?.variants && typeof card.variants === "object" ? card.variants : {};
    const keys = ["normal", "holo", "reverse", "firstEdition", "wPromo"].filter(key => Boolean(variants[key]));
    return keys.length ? keys : ["normal"];
  }

  function requiredGoalSlots(card, goal = "numbers") {
    const normalizedGoal = normalizeProjectGoal(goal);
    if (normalizedGoal === "numbers") return [{ key: "number", label: "Kartennummer" }];
    const available = availableVariantKeys(card);
    if (normalizedGoal === "normal-reverse") {
      const slots = [{ key: "base", label: "Normal/Holo" }];
      if (available.includes("reverse")) slots.push({ key: "reverse", label: "Reverse Holo" });
      return slots;
    }
    return available.map(key => ({ key, label: variantLabel(key) }));
  }

  function entryMatchesGoalSlot(entry, slotKey) {
    const variant = normalizeVariant(entry?.variant);
    if (slotKey === "number") return Number(entry?.quantity || 0) > 0;
    if (slotKey === "base") return Number(entry?.quantity || 0) > 0 && variant !== "reverse";
    return Number(entry?.quantity || 0) > 0 && variant === slotKey;
  }

  function isSecretCard(card, officialTotal) {
    const match = String(card?.localId || "").match(/^(\d+)/);
    if (!match || !Number(officialTotal)) return false;
    return Number(match[1]) > Number(officialTotal);
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

  function trainerGalleryParentSetId(value) {
    const id = normalizeSetId(value);
    const match = id.match(/^swsh(\d+)\.5tg$/);
    return match ? `swsh${match[1]}` : "";
  }

  function applySetAssetFallbacks(sets = []) {
    const byId = new Map(sets.map(set => [normalizeSetId(set.id), set]));
    return sets.map(set => {
      const parentId = trainerGalleryParentSetId(set.id);
      const parent = parentId ? byId.get(parentId) : null;
      return {
        ...set,
        parentSetId: parentId,
        fallbackLogo: set.fallbackLogo || parent?.logo || parent?.fallbackLogo || "",
        fallbackSymbol: set.fallbackSymbol || parent?.symbol || parent?.fallbackSymbol || ""
      };
    });
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
    const normalized = {
      id: String(set?.id || ""),
      name: String(set?.name || set?.id || "Unbekanntes Set"),
      logo: assetUrl(set?.logo),
      symbol: assetUrl(set?.symbol),
      fallbackLogo: assetUrl(set?.fallbackLogo),
      fallbackSymbol: assetUrl(set?.fallbackSymbol),
      language,
      cardCount: {
        total: Math.max(0, Number(set?.cardCount?.total || 0)),
        official: Math.max(0, Number(set?.cardCount?.official || 0))
      },
      releaseDate: String(set?.releaseDate || set?.release?.official || ""),
      tcgOnline: String(set?.tcgOnline || set?.ptcgoCode || ""),
      abbreviations: set?.abbreviations && typeof set.abbreviations === "object" ? { ...set.abbreviations } : null,
      serie: set?.serie ? {
        id: String(set.serie.id || ""),
        name: String(set.serie.name || "")
      } : null
    };
    normalized.cardmarketSetCode = window.CardDexCore?.deriveCardmarketSetCode?.(normalized) || "";
    return normalized;
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
      thirdParty: card?.thirdParty || null,
      cardmarketProductId: window.CardDexCore?.extractCardmarketProductId?.(card) || "",
      cardmarketSetCode: window.CardDexCore?.deriveCardmarketSetCode?.({ ...card, set }) || set.cardmarketSetCode || "",
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
        fallbackLogo: set.fallbackLogo || "",
        fallbackSymbol: set.fallbackSymbol || "",
        tcgOnline: set.tcgOnline || "",
        abbreviations: set.abbreviations || null,
        cardmarketSetCode: set.cardmarketSetCode || "",
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
      const normalizedSets = Array.isArray(result.data)
        ? result.data.map(set => normalizeSetBrief(set, result.language)).filter(set => set.id)
        : [];
      const data = applySetAssetFallbacks(normalizedSets);
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
      let set = normalizeSetBrief(result.data, result.language);
      try {
        const catalog = await getSetCatalog(result.language);
        const catalogSet = catalog.data?.find(item => normalizeSetId(item.id) === cleanSetId);
        if (catalogSet) set = { ...catalogSet, ...set, fallbackLogo: set.fallbackLogo || catalogSet.fallbackLogo || "", fallbackSymbol: set.fallbackSymbol || catalogSet.fallbackSymbol || "" };
      } catch {
        // Das Set selbst bleibt auch ohne Katalog-Fallback nutzbar.
      }
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
        language: entry.language || "de",
        variant: normalizeVariant(entry.variant || "normal"),
        condition: entry.condition || "NM",
        tradeQuantity: Math.max(0, Number(entry.tradeQuantity || 0)),
        soldQuantity: Math.max(0, Number(entry.soldQuantity || 0)),
        tradedAwayQuantity: Math.max(0, Number(entry.tradedAwayQuantity || 0)),
        updatedAt: entry.updatedAt || ""
      });
      if (!current.card?.image && card.image) current.card = card;
      target.set(key, current);

      const existingMeta = setMeta.get(setId) || {
        id: setId,
        name: card.setName || card.set?.name || card._setBrief?.name || setId,
        logo: assetUrl(card.set?.logo || card._setBrief?.logo),
        symbol: assetUrl(card.set?.symbol || card._setBrief?.symbol),
        fallbackLogo: assetUrl(card.set?.fallbackLogo || card._setBrief?.fallbackLogo),
        fallbackSymbol: assetUrl(card.set?.fallbackSymbol || card._setBrief?.fallbackSymbol),
        cardmarketSetCode: card.cardmarketSetCode
          || card.set?.cardmarketSetCode
          || card._setBrief?.cardmarketSetCode
          || window.CardDexCore?.deriveCardmarketSetCode?.(card)
          || "",
        officialTotal: Math.max(0, Number(card.officialTotal || card.set?.cardCount?.official || card._setBrief?.cardCount?.official || 0)),
        total: Math.max(0, Number(card.set?.cardCount?.total || card._setBrief?.cardCount?.total || 0))
      };
      if (!existingMeta.fallbackLogo) existingMeta.fallbackLogo = assetUrl(card.set?.fallbackLogo || card._setBrief?.fallbackLogo);
      if (!existingMeta.fallbackSymbol) existingMeta.fallbackSymbol = assetUrl(card.set?.fallbackSymbol || card._setBrief?.fallbackSymbol);
      if (!existingMeta.cardmarketSetCode) {
        existingMeta.cardmarketSetCode = card.cardmarketSetCode
          || card.set?.cardmarketSetCode
          || card._setBrief?.cardmarketSetCode
          || window.CardDexCore?.deriveCardmarketSetCode?.(card)
          || "";
      }
      existingMeta.officialTotal = Math.max(existingMeta.officialTotal, Number(card.officialTotal || 0));
      setMeta.set(setId, existingMeta);
    });

    return { collections, entries, cards, ownedByKey, wishlistByKey, setMeta };
  }

  function annotateDuplicateEntries(entries = []) {
    const groups = new Map();
    entries.forEach(entry => {
      const groupKey = `${String(entry.language || "de").toLowerCase()}::${normalizeVariant(entry.variant)}`;
      const group = groups.get(groupKey) || { quantity: 0, tradeQuantity: 0 };
      group.quantity += Math.max(0, Number(entry.quantity || 0));
      group.tradeQuantity += Math.max(0, Number(entry.tradeQuantity || 0));
      groups.set(groupKey, group);
    });
    return entries.map(entry => {
      const groupKey = `${String(entry.language || "de").toLowerCase()}::${normalizeVariant(entry.variant)}`;
      const group = groups.get(groupKey) || { quantity: 0, tradeQuantity: 0 };
      const groupDuplicateCopies = Math.max(0, group.quantity - 1);
      return {
        ...entry,
        duplicateGroupKey: groupKey,
        groupQuantity: group.quantity,
        groupDuplicateCopies,
        groupTradeQuantity: Math.min(groupDuplicateCopies, group.tradeQuantity)
      };
    });
  }

  function duplicateStatsForOwnedItem(item) {
    const entries = annotateDuplicateEntries(Array.isArray(item?.entries) ? item.entries : []);
    const groups = new Map();
    entries.forEach(entry => {
      if (!groups.has(entry.duplicateGroupKey)) {
        groups.set(entry.duplicateGroupKey, {
          duplicateCopies: entry.groupDuplicateCopies,
          tradeQuantity: entry.groupTradeQuantity
        });
      }
    });
    return {
      entries,
      duplicateCopies: [...groups.values()].reduce((sum, group) => sum + group.duplicateCopies, 0),
      tradeQuantity: [...groups.values()].reduce((sum, group) => sum + group.tradeQuantity, 0)
    };
  }

  function buildSetSummary(set, snapshot) {
    const setId = normalizeSetId(set.id);
    const owned = [...snapshot.ownedByKey.values()].filter(item => item.setId === setId);
    const wishlist = [...snapshot.wishlistByKey.values()].filter(item => item.setId === setId);
    const ownedUnique = owned.length;
    const ownedCopies = owned.reduce((sum, item) => sum + item.quantity, 0);
    const duplicateDetails = owned.map(duplicateStatsForOwnedItem);
    const duplicateCards = duplicateDetails.filter(item => item.duplicateCopies > 0).length;
    const duplicateCopies = duplicateDetails.reduce((sum, item) => sum + item.duplicateCopies, 0);
    const tradeQuantity = duplicateDetails.reduce((sum, item) => sum + item.tradeQuantity, 0);
    const total = Math.max(0, Number(set.cardCount?.total || set.total || set.cardCount?.official || set.officialTotal || 0));
    const missing = total ? Math.max(0, total - ownedUnique) : 0;
    const progress = total ? Math.min(100, Math.round((ownedUnique / total) * 100)) : 0;
    const projectSettings = getProjectSettings(setId);
    const project = isSetProject(setId);
    const cachedGoal = readProjectProgressCache()[setId];
    const goalProgressKnown = Boolean(project && cachedGoal && normalizeProjectGoal(cachedGoal.goal) === projectSettings.goal);
    const display = goalProgressKnown
      ? { owned: cachedGoal.owned, total: cachedGoal.target, missing: cachedGoal.missing, progress: cachedGoal.progress, complete: cachedGoal.complete }
      : { owned: ownedUnique, total, missing, progress, complete: Boolean(total && ownedUnique >= total) };
    return {
      ...set,
      id: setId,
      ownedUnique,
      ownedCopies,
      duplicateCards,
      duplicateCopies,
      tradeQuantity,
      wishlistCount: wishlist.length,
      total,
      missing,
      progress,
      complete: Boolean(total && ownedUnique >= total),
      project,
      projectGoal: projectSettings.goal,
      goalProgressKnown,
      displayOwned: display.owned,
      displayTotal: display.total,
      displayMissing: display.missing,
      displayProgress: display.progress,
      displayComplete: display.complete
    };
  }

  function calculateCardGoalState(card, goal) {
    const slots = requiredGoalSlots(card, goal);
    const entries = Array.isArray(card?.ownedEntries) ? card.ownedEntries : [];
    const fulfilled = slots.filter(slot => entries.some(entry => entryMatchesGoalSlot(entry, slot.key)));
    const missingSlots = slots.filter(slot => !fulfilled.some(item => item.key === slot.key));
    return {
      targetSlots: slots.length,
      ownedSlots: fulfilled.length,
      complete: slots.length > 0 && fulfilled.length >= slots.length,
      missingSlots
    };
  }

  function calculateSetGoalProgress(cards, set, goal) {
    const catalogCards = cards.filter(card => !card.unlisted);
    const officialTotal = Math.max(0, Number(set?.cardCount?.official || 0));
    let target = 0;
    let owned = 0;
    let regularTarget = 0;
    let regularOwned = 0;
    let secretTarget = 0;
    let secretOwned = 0;

    catalogCards.forEach(card => {
      const state = calculateCardGoalState(card, goal);
      card.goal = state;
      target += state.targetSlots;
      owned += state.ownedSlots;
      if (isSecretCard(card, officialTotal)) {
        secretTarget += state.targetSlots;
        secretOwned += state.ownedSlots;
      } else {
        regularTarget += state.targetSlots;
        regularOwned += state.ownedSlots;
      }
    });

    const missing = Math.max(0, target - owned);
    return {
      goal: normalizeProjectGoal(goal),
      target,
      owned,
      missing,
      progress: target ? Math.min(100, Math.round((owned / target) * 100)) : 0,
      complete: Boolean(target && owned >= target),
      regular: {
        target: regularTarget,
        owned: regularOwned,
        missing: Math.max(0, regularTarget - regularOwned)
      },
      secret: {
        target: secretTarget,
        owned: secretOwned,
        missing: Math.max(0, secretTarget - secretOwned)
      }
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
        fallbackLogo: fallback.fallbackLogo || "",
        fallbackSymbol: fallback.fallbackSymbol || "",
        cardmarketSetCode: fallback.cardmarketSetCode || "",
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
      fallbackLogo: fallback.fallbackLogo || "",
      fallbackSymbol: fallback.fallbackSymbol || "",
      cardmarketSetCode: fallback.cardmarketSetCode || "",
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
            cardmarketProductId: item.card.cardmarketProductId || "",
            cardmarketSetCode: item.card.cardmarketSetCode || set.cardmarketSetCode || "",
            thirdParty: item.card.thirdParty || null,
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
              fallbackLogo: set.fallbackLogo || "",
              fallbackSymbol: set.fallbackSymbol || "",
              cardmarketSetCode: set.cardmarketSetCode || "",
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
      const duplicateStats = duplicateStatsForOwnedItem(owned);
      return {
        ...card,
        key,
        ownedQuantity: owned?.quantity || 0,
        duplicateCopies: duplicateStats.duplicateCopies,
        tradeQuantity: duplicateStats.tradeQuantity,
        ownedEntries: duplicateStats.entries || [],
        wishlistQuantity: wishlist?.quantity || 0,
        wishlistEntries: wishlist?.entries || []
      };
    });

    const summary = buildSetSummary(set, snapshot);
    const projectSettings = getProjectSettings(cleanSetId);
    const goalProgress = calculateSetGoalProgress(cards, set, projectSettings.goal);
    storeProjectProgress(cleanSetId, goalProgress);
    const missingCards = cards.filter(card => !card.ownedQuantity && !card.unlisted).length;
    const numberRegularCards = cards.filter(card => !card.unlisted && !isSecretCard(card, set.cardCount?.official));
    const numberSecretCards = cards.filter(card => !card.unlisted && isSecretCard(card, set.cardCount?.official));
    const numberStats = {
      regular: {
        total: numberRegularCards.length,
        owned: numberRegularCards.filter(card => card.ownedQuantity > 0).length
      },
      secret: {
        total: numberSecretCards.length,
        owned: numberSecretCards.filter(card => card.ownedQuantity > 0).length
      }
    };

    return {
      set: {
        ...summary,
        missing: detailResult.data ? missingCards : summary.missing,
        projectGoal: projectSettings.goal,
        goalTarget: goalProgress.target,
        goalOwned: goalProgress.owned,
        goalMissing: goalProgress.missing,
        goalProgress: goalProgress.progress,
        goalComplete: goalProgress.complete
      },
      cards,
      goalProgress,
      numberStats,
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
      thirdParty: card.thirdParty || null,
      cardmarketProductId: card.cardmarketProductId || window.CardDexCore?.extractCardmarketProductId?.(card) || "",
      cardmarketSetCode: card.cardmarketSetCode || set.cardmarketSetCode || window.CardDexCore?.deriveCardmarketSetCode?.({ ...card, set }) || "",
      source: card.source || "tcgdex",
      dataLanguage: card.dataLanguage || card._dataLanguage || set.language || "de",
      _dataLanguage: card._dataLanguage || card.dataLanguage || set.language || "de",
      set: {
        id: set.id,
        name: set.name,
        logo: set.logo,
        symbol: set.symbol,
        fallbackLogo: set.fallbackLogo || "",
        fallbackSymbol: set.fallbackSymbol || "",
        tcgOnline: set.tcgOnline || "",
        abbreviations: set.abbreviations || null,
        cardmarketSetCode: set.cardmarketSetCode || "",
        cardCount: { ...set.cardCount }
      }
    };
  }

  async function getOwnedVariantGroupEntries(entry) {
    const db = await openDatabase();
    const tx = db.transaction("entries", "readonly");
    const done = transactionDone(tx);
    const all = await requestToPromise(tx.objectStore("entries").index("cardId").getAll(entry.cardId));
    await done;
    return all.filter(candidate =>
      candidate.collectionId !== "wishlist"
      && String(candidate.language || "de").toLowerCase() === String(entry.language || "de").toLowerCase()
      && normalizeVariant(candidate.variant) === normalizeVariant(entry.variant)
    );
  }

  async function updateTradeQuantity(entryId, delta = 0) {
    const id = String(entryId || "").trim();
    if (!id) throw new Error("Dubletten-Eintrag fehlt.");
    const db = await openDatabase();
    const readTx = db.transaction("entries", "readonly");
    const readDone = transactionDone(readTx);
    const entry = await requestToPromise(readTx.objectStore("entries").get(id));
    await readDone;
    if (!entry || entry.collectionId === "wishlist") throw new Error("Der Sammlungseintrag wurde nicht gefunden.");

    const group = await getOwnedVariantGroupEntries(entry);
    const totalQuantity = group.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    const maximumGroupTrade = Math.max(0, totalQuantity - 1);
    const currentGroupTrade = group.reduce((sum, item) => sum + Math.max(0, Number(item.tradeQuantity || 0)), 0);
    const currentEntryTrade = Math.max(0, Number(entry.tradeQuantity || 0));
    let next = currentEntryTrade;
    if (Number(delta || 0) > 0 && currentGroupTrade < maximumGroupTrade) {
      next = Math.min(Math.max(0, Number(entry.quantity || 0)), currentEntryTrade + 1);
    } else if (Number(delta || 0) < 0) {
      next = Math.max(0, currentEntryTrade - 1);
    }

    const tx = db.transaction("entries", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("entries").put({ ...entry, tradeQuantity: next, updatedAt: new Date().toISOString(), syncStatus: "local" });
    await done;
    await window.CardDexCollections?.refresh?.();
    return next;
  }

  async function disposeDuplicate(entryId, reason = "sold") {
    const id = String(entryId || "").trim();
    if (!id) throw new Error("Dubletten-Eintrag fehlt.");
    const db = await openDatabase();
    const readTx = db.transaction("entries", "readonly");
    const readDone = transactionDone(readTx);
    const entry = await requestToPromise(readTx.objectStore("entries").get(id));
    await readDone;
    if (!entry || entry.collectionId === "wishlist") throw new Error("Der Sammlungseintrag wurde nicht gefunden.");

    const group = await getOwnedVariantGroupEntries(entry);
    const totalQuantity = group.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    if (totalQuantity <= 1) throw new Error("Von dieser Sprach-/Variantenkombination ist keine Dublette vorhanden.");

    const quantity = Math.max(0, Number(entry.quantity || 0));
    if (!quantity) throw new Error("Der Sammlungseintrag ist leer.");
    const nextQuantity = quantity - 1;
    const historyField = reason === "traded" ? "tradedAwayQuantity" : "soldQuantity";
    const now = new Date().toISOString();
    const nextRecord = {
      ...entry,
      quantity: nextQuantity,
      tradeQuantity: Math.min(Math.max(0, Number(entry.tradeQuantity || 0)), nextQuantity),
      [historyField]: Math.max(0, Number(entry[historyField] || 0)) + 1,
      updatedAt: now,
      syncStatus: "local"
    };

    const remaining = group
      .filter(item => item.id !== id && Number(item.quantity || 0) > 0)
      .map(item => ({ ...item }));
    if (nextQuantity > 0) {
      remaining.push(nextRecord);
    } else if (remaining.length) {
      // Historische Abgänge bleiben am verbleibenden Datensatz der gleichen Variante erhalten.
      remaining[0] = {
        ...remaining[0],
        soldQuantity: Math.max(0, Number(remaining[0].soldQuantity || 0)) + Math.max(0, Number(nextRecord.soldQuantity || 0)),
        tradedAwayQuantity: Math.max(0, Number(remaining[0].tradedAwayQuantity || 0)) + Math.max(0, Number(nextRecord.tradedAwayQuantity || 0)),
        updatedAt: now,
        syncStatus: "local"
      };
    }

    // Nach einem Abgang darf höchstens Gesamtbestand minus ein Exemplar als Tausch markiert bleiben.
    const maximumTradeAfter = Math.max(0, totalQuantity - 2);
    let tradeAfter = remaining.reduce((sum, item) => sum + Math.min(Math.max(0, Number(item.quantity || 0)), Math.max(0, Number(item.tradeQuantity || 0))), 0);
    let excessTrade = Math.max(0, tradeAfter - maximumTradeAfter);
    for (let index = remaining.length - 1; index >= 0 && excessTrade > 0; index -= 1) {
      const record = remaining[index];
      const currentTrade = Math.max(0, Number(record.tradeQuantity || 0));
      const reduction = Math.min(currentTrade, excessTrade);
      if (reduction) {
        remaining[index] = { ...record, tradeQuantity: currentTrade - reduction, updatedAt: now, syncStatus: "local" };
        excessTrade -= reduction;
      }
    }

    const tx = db.transaction("entries", "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("entries");
    if (nextQuantity <= 0) store.delete(id);
    remaining.forEach(record => store.put(record));
    await done;
    await window.CardDexCollections?.refresh?.();
    return nextQuantity;
  }

  async function init() {
    await openDatabase();
    window.CardDexCore?.emit?.("sets-ready", { version: window.CardDexCore?.version || "6.15.1" });
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
    getAllProjectSettings,
    replaceAllProjectSettings,
    getProjectSettings,
    setProjectSettings,
    updateTradeQuantity,
    disposeDuplicate,
    normalizeProjectGoal,
    normalizeSetId,
    normalizeLocalId,
    cardKey,
    assetUrl,
    trainerGalleryParentSetId,
    applySetAssetFallbacks
  });
})();
