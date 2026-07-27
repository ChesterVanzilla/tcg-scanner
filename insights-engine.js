"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 2;
  const WISHLIST_COLLECTION_ID = "wishlist";
  let dbPromise = null;

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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("CardDex-Datenbank konnte nicht geöffnet werden."));
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("collections")) db.createObjectStore("collections", { keyPath: "id" });
        if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("collectionId", "collectionId", { unique: false });
        }
        if (!db.objectStoreNames.contains("scanHistory")) {
          const store = db.createObjectStore("scanHistory", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
        }
      };
    });
    return dbPromise;
  }

  function positiveNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function entryQuantity(value) {
    if (value === null || value === undefined || value === "") return 1;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 1;
  }

  function hasPrice(value) {
    return value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  }

  function normalizeStatus(value) {
    const status = String(value || "verified").toLowerCase();
    if (status === "provisional") return "provisional";
    if (status === "review") return "review";
    return "verified";
  }

  function normalizeVariant(value) {
    const variant = String(value || "normal").trim();
    return variant || "normal";
  }

  function normalizeLanguage(value) {
    const language = String(value || "de").trim().toLowerCase();
    return language || "de";
  }

  function cardSetId(card) {
    return String(card?.set?.id || card?.setId || card?._setId || "").trim().toLowerCase();
  }

  function cardSetName(card) {
    return String(card?.set?.name || card?.setName || card?._setBrief?.name || cardSetId(card) || "Unbekanntes Set").trim();
  }

  function cardHasImage(card) {
    if (!card) return false;
    if (String(card.scanImage || "").startsWith("data:image/")) return true;
    return /^https?:\/\//i.test(String(card.image || "").trim());
  }

  function localDayKey(value = new Date()) {
    return window.CardDexCore?.localDayKey?.(value) || (() => {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    })();
  }

  function startOfDay(date) {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  function getLastDays(count) {
    const today = startOfDay(new Date());
    return Array.from({ length: count }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (count - 1 - index));
      return { date, key: localDayKey(date) };
    });
  }

  async function readDatabaseSnapshot() {
    const db = await openDatabase();
    const tx = db.transaction(["collections", "cards", "entries", "scanHistory"], "readonly");
    const done = transactionDone(tx);
    const [collections, cards, entries, history] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("cards").getAll()),
      requestToPromise(tx.objectStore("entries").getAll()),
      requestToPromise(tx.objectStore("scanHistory").getAll())
    ]);
    await done;
    return { collections, cards, entries, history };
  }

  function buildFallbackSetOverview(ownedEntries, cardsById) {
    const groups = new Map();
    ownedEntries.forEach(entry => {
      const card = cardsById.get(entry.cardId);
      const setId = cardSetId(card);
      if (!setId) return;
      const group = groups.get(setId) || {
        id: setId,
        name: cardSetName(card),
        ownedIds: new Set(),
        copies: 0,
        total: Math.max(0, Number(card?.set?.cardCount?.total || card?.officialTotal || 0)),
        project: Boolean(window.CardDexSetEngine?.isSetProject?.(setId)),
        displayProgress: 0,
        displayOwned: 0,
        displayTotal: 0,
        displayMissing: 0,
        displayComplete: false
      };
      group.ownedIds.add(entry.cardId);
      group.copies += entryQuantity(entry.quantity);
      const total = Math.max(0, Number(card?.set?.cardCount?.total || card?.officialTotal || 0));
      if (total > group.total) group.total = total;
      groups.set(setId, group);
    });

    return [...groups.values()].map(group => {
      const ownedUnique = group.ownedIds.size;
      const progress = group.total ? Math.min(100, Math.round((ownedUnique / group.total) * 100)) : 0;
      return {
        id: group.id,
        name: group.name,
        ownedUnique,
        ownedCopies: group.copies,
        total: group.total,
        missing: group.total ? Math.max(0, group.total - ownedUnique) : 0,
        progress,
        complete: Boolean(group.total && ownedUnique >= group.total),
        project: group.project,
        displayOwned: ownedUnique,
        displayTotal: group.total,
        displayMissing: group.total ? Math.max(0, group.total - ownedUnique) : 0,
        displayProgress: progress,
        displayComplete: Boolean(group.total && ownedUnique >= group.total)
      };
    });
  }

  async function getOptionalSetOverview(ownedEntries, cardsById, force = false) {
    const fallbackSets = buildFallbackSetOverview(ownedEntries, cardsById);
    if (!window.CardDexSetEngine?.getSetOverview) {
      return { sets: fallbackSets, stats: {}, catalogAvailable: false, stale: true, error: "Set-Engine nicht verfügbar" };
    }

    let timeoutId = null;
    try {
      const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Set-Auswertung hat zu lange gedauert.")), 7000);
      });
      const result = await Promise.race([
        window.CardDexSetEngine.getSetOverview({ includeAll: true, force }),
        timeout
      ]);
      clearTimeout(timeoutId);
      return result || { sets: fallbackSets, stats: {}, catalogAvailable: false, stale: true, error: "Keine Set-Daten" };
    } catch (error) {
      clearTimeout(timeoutId);
      return {
        sets: fallbackSets,
        stats: {},
        catalogAvailable: false,
        stale: true,
        error: String(error?.message || error)
      };
    }
  }

  function buildActivity(history) {
    const days = getLastDays(7);
    const counts = new Map(days.map(day => [day.key, { total: 0, verified: 0, review: 0 }]));
    history.forEach(record => {
      const day = counts.get(localDayKey(record.createdAt));
      if (!day) return;
      day.total += 1;
      if (normalizeStatus(record.status) === "verified") day.verified += 1;
      else day.review += 1;
    });

    const now = Date.now();
    const last30 = history.filter(record => {
      const timestamp = Date.parse(record.createdAt || "");
      return Number.isFinite(timestamp) && now - timestamp < 30 * 24 * 60 * 60 * 1000;
    });
    const verified30 = last30.filter(record => normalizeStatus(record.status) === "verified").length;

    return {
      days: days.map(day => ({ ...day, ...counts.get(day.key) })),
      last7: [...counts.values()].reduce((sum, day) => sum + day.total, 0),
      last30: last30.length,
      verified30,
      verificationRate30: last30.length ? Math.round((verified30 / last30.length) * 100) : 0
    };
  }

  function distributionMapToArray(map, labelFormatter = value => value) {
    return [...map.entries()]
      .map(([key, value]) => ({ key, label: labelFormatter(key), value }))
      .sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label), "de"));
  }

  function variantLabel(value) {
    const labels = {
      normal: "Normal",
      holo: "Holo",
      reverse: "Reverse Holo",
      firstEdition: "1. Edition",
      wPromo: "Promo-Variante"
    };
    return labels[value] || String(value || "Normal");
  }

  function languageLabel(value) {
    const labels = { de: "Deutsch", en: "Englisch", ja: "Japanisch", fr: "Französisch", it: "Italienisch", es: "Spanisch" };
    return labels[value] || String(value || "Unbekannt").toUpperCase();
  }

  async function getInsightsData(options = {}) {
    const snapshot = await readDatabaseSnapshot();
    const collectionById = new Map(snapshot.collections.map(collection => [collection.id, collection]));
    const cardsById = new Map(snapshot.cards.map(card => [card.id, card]));
    const ownedEntries = snapshot.entries.filter(entry => {
      const collection = collectionById.get(entry.collectionId);
      return collection && collection.type !== "wishlist" && entry.collectionId !== WISHLIST_COLLECTION_ID;
    });
    const wishlistEntries = snapshot.entries.filter(entry => {
      const collection = collectionById.get(entry.collectionId);
      return collection?.type === "wishlist" || entry.collectionId === WISHLIST_COLLECTION_ID;
    });

    const duplicateGroups = new Map();
    const languageDistribution = new Map();
    const variantDistribution = new Map();
    let totalCopies = 0;
    let purchaseInvestment = 0;
    let pricedCopies = 0;
    let tradeQuantity = 0;
    let soldQuantity = 0;
    let tradedAwayQuantity = 0;
    let entriesWithNotes = 0;
    let unpricedEntries = 0;

    ownedEntries.forEach(entry => {
      const quantity = entryQuantity(entry.quantity);
      totalCopies += quantity;
      tradeQuantity += Math.min(quantity, positiveNumber(entry.tradeQuantity));
      soldQuantity += positiveNumber(entry.soldQuantity);
      tradedAwayQuantity += positiveNumber(entry.tradedAwayQuantity);
      if (String(entry.notes || "").trim()) entriesWithNotes += 1;
      if (hasPrice(entry.purchasePrice)) {
        purchaseInvestment += Number(entry.purchasePrice) * quantity;
        pricedCopies += quantity;
      } else {
        unpricedEntries += 1;
      }

      const language = normalizeLanguage(entry.language);
      languageDistribution.set(language, (languageDistribution.get(language) || 0) + quantity);
      const variant = normalizeVariant(entry.variant);
      variantDistribution.set(variant, (variantDistribution.get(variant) || 0) + quantity);
      const groupKey = `${entry.cardId}::${language}::${variant}`;
      duplicateGroups.set(groupKey, (duplicateGroups.get(groupKey) || 0) + quantity);
    });

    const duplicateCopies = [...duplicateGroups.values()].reduce((sum, quantity) => sum + Math.max(0, quantity - 1), 0);
    const uniqueCardIds = new Set(ownedEntries.map(entry => entry.cardId).filter(Boolean));
    const uniqueVariants = duplicateGroups.size;
    const qualityCards = [...uniqueCardIds].map(cardId => cardsById.get(cardId)).filter(Boolean);
    const quality = {
      verified: qualityCards.filter(card => normalizeStatus(card.verificationStatus) === "verified").length,
      provisional: qualityCards.filter(card => normalizeStatus(card.verificationStatus) === "provisional").length,
      review: qualityCards.filter(card => normalizeStatus(card.verificationStatus) === "review").length,
      missingImages: qualityCards.filter(card => !cardHasImage(card)).length,
      entriesWithNotes,
      unpricedEntries
    };

    let wishlistCopies = 0;
    let wishlistTargetBudget = 0;
    wishlistEntries.forEach(entry => {
      const quantity = entryQuantity(entry.quantity);
      wishlistCopies += quantity;
      if (hasPrice(entry.targetPrice)) wishlistTargetBudget += Number(entry.targetPrice) * quantity;
    });

    const collectionStats = snapshot.collections
      .filter(collection => collection.type !== "wishlist")
      .map(collection => {
        const entries = ownedEntries.filter(entry => entry.collectionId === collection.id);
        const groups = new Map();
        entries.forEach(entry => {
          const key = `${entry.cardId}::${normalizeLanguage(entry.language)}::${normalizeVariant(entry.variant)}`;
          groups.set(key, (groups.get(key) || 0) + entryQuantity(entry.quantity));
        });
        return {
          id: collection.id,
          name: collection.name || "Sammlung",
          copies: entries.reduce((sum, entry) => sum + entryQuantity(entry.quantity), 0),
          unique: new Set(entries.map(entry => entry.cardId).filter(Boolean)).size,
          duplicates: [...groups.values()].reduce((sum, quantity) => sum + Math.max(0, quantity - 1), 0),
          trade: entries.reduce((sum, entry) => sum + Math.min(entryQuantity(entry.quantity), positiveNumber(entry.tradeQuantity)), 0),
          investment: entries.reduce((sum, entry) => sum + (hasPrice(entry.purchasePrice) ? Number(entry.purchasePrice) * entryQuantity(entry.quantity) : 0), 0)
        };
      })
      .sort((a, b) => b.copies - a.copies || a.name.localeCompare(b.name, "de"));

    const setOverview = await getOptionalSetOverview(ownedEntries, cardsById, Boolean(options.force));
    const startedSets = (setOverview.sets || []).filter(set => Number(set.ownedUnique || set.displayOwned || 0) > 0);
    const topSets = startedSets
      .slice()
      .sort((a, b) => Number(b.ownedUnique || 0) - Number(a.ownedUnique || 0) || Number(b.displayProgress || b.progress || 0) - Number(a.displayProgress || a.progress || 0))
      .slice(0, 6);
    const projects = (setOverview.sets || [])
      .filter(set => set.project)
      .sort((a, b) => Number(b.displayProgress || b.progress || 0) - Number(a.displayProgress || a.progress || 0) || String(a.name).localeCompare(String(b.name), "de"));
    const completedProjects = projects.filter(project => Boolean(project.displayComplete || project.complete)).length;
    const averageProjectProgress = projects.length
      ? Math.round(projects.reduce((sum, project) => sum + Number(project.displayProgress || project.progress || 0), 0) / projects.length)
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        totalCopies,
        uniqueCards: uniqueCardIds.size,
        uniqueVariants,
        duplicateCopies,
        tradeQuantity,
        soldQuantity,
        tradedAwayQuantity,
        collectionCount: collectionStats.length,
        wishlistCount: wishlistEntries.length,
        wishlistCopies,
        purchaseInvestment,
        wishlistTargetBudget,
        pricedCopies
      },
      quality,
      activity: buildActivity(snapshot.history),
      collections: collectionStats,
      languages: distributionMapToArray(languageDistribution, languageLabel),
      variants: distributionMapToArray(variantDistribution, variantLabel),
      sets: {
        started: startedSets.length,
        complete: startedSets.filter(set => Boolean(set.displayComplete || set.complete)).length,
        top: topSets,
        projects,
        projectCount: projects.length,
        completedProjects,
        averageProjectProgress,
        projectMissing: projects.reduce((sum, project) => sum + Math.max(0, Number(project.displayMissing ?? project.missing ?? 0)), 0),
        catalogAvailable: Boolean(setOverview.catalogAvailable),
        stale: Boolean(setOverview.stale),
        error: setOverview.error || ""
      }
    };
  }

  async function init() {
    await openDatabase();
    window.CardDexCore?.emit?.("insights-ready", { version: window.CardDexCore?.version || "7.0.4" });
  }

  window.CardDexInsightsEngine = Object.freeze({
    init,
    getInsightsData
  });
})();
