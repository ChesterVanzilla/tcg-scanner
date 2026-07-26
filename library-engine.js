"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 2;
  const HISTORY_STORE = "scanHistory";
  const HISTORY_LIMIT = 250;
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

  function ensureHistoryStore(db) {
    if (db.objectStoreNames.contains(HISTORY_STORE)) return;
    const store = db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
    store.createIndex("createdAt", "createdAt", { unique: false });
    store.createIndex("status", "status", { unique: false });
    store.createIndex("cardId", "cardId", { unique: false });
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
        ensureHistoryStore(db);
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
      request.onblocked = () => reject(new Error("Die lokale Datenbank wird noch von einer alten App-Version verwendet."));
    });
    return dbPromise;
  }

  function createId() {
    return `scan-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  }

  function normalizeStatus(value) {
    return ["verified", "provisional", "review"].includes(value) ? value : "review";
  }

  function cleanRecord(input) {
    const now = new Date().toISOString();
    const card = input?.card && typeof input.card === "object" ? input.card : {};
    const recognition = input?.recognition && typeof input.recognition === "object" ? input.recognition : {};
    const status = normalizeStatus(input?.status);
    return {
      id: String(input?.id || createId()),
      createdAt: input?.createdAt || now,
      updatedAt: now,
      source: input?.source === "manual" ? "manual" : "scan",
      status,
      confidence: Math.max(0, Math.min(100, Math.round(Number(input?.confidence || 0)))),
      candidateCount: Math.max(0, Math.round(Number(input?.candidateCount || 0))),
      language: String(input?.language || card._dataLanguage || card.dataLanguage || "de"),
      cardId: String(card.id || input?.cardId || ""),
      card: {
        id: String(card.id || input?.cardId || `local-${Date.now()}`),
        name: String(card.name || "Unbekannte Karte"),
        localId: String(card.localId || ""),
        setId: String(card.setId || card.set?.id || card._setBrief?.id || ""),
        setName: String(card.setName || card.set?.name || card._setBrief?.name || "Set nicht angegeben"),
        officialTotal: card.officialTotal || card.set?.cardCount?.official || card._setBrief?.cardCount?.official || null,
        image: String(card.image || ""),
        directImage: Boolean(card.directImage || card._directImage),
        scanImage: String(card.scanImage || (status !== "verified" ? input?.scanPreview : "")),
        source: String(card.source || card._externalSource || "tcgdex"),
        _externalSource: String(card._externalSource || card.source || "tcgdex"),
        _dataLanguage: String(card._dataLanguage || card.dataLanguage || input?.language || "de"),
        verificationStatus: status === "verified" ? "verified" : "provisional",
        confidence: Number(card.confidence || Number(input?.confidence || 0) / 100 || 0),
        rarity: String(card.rarity || ""),
        category: String(card.category || ""),
        illustrator: String(card.illustrator || ""),
        hp: card.hp ?? null,
        types: Array.isArray(card.types) ? card.types.slice(0, 4) : [],
        variants: card.variants || null,
        pricing: card.pricing || null,
        cardmarketProductId: String(card.cardmarketProductId || window.CardDexCore?.extractCardmarketProductId?.(card) || ""),
        cardmarketUrl: String(card.cardmarketUrl || ""),
        cardmarketSetCode: String(card.cardmarketSetCode || ""),
        pokemonTcgId: String(card.pokemonTcgId || ""),
        englishName: String(card.englishName || ""),
        set: card.set ? {
          id: String(card.set.id || ""),
          name: String(card.set.name || ""),
          ptcgoCode: String(card.set.ptcgoCode || ""),
          cardCount: { official: card.set.cardCount?.official || card.set.printedTotal || null }
        } : null,
        _setBrief: card._setBrief ? {
          id: String(card._setBrief.id || ""),
          name: String(card._setBrief.name || ""),
          cardCount: { official: card._setBrief.cardCount?.official || null }
        } : null
      },
      recognition: {
        name: String(recognition.name || card.name || ""),
        number: String(recognition.number || card.localId || ""),
        denominator: String(recognition.denominator || ""),
        setCode: String(recognition.setCode || card.cardmarketSetCode || ""),
        aiConfidence: Number(recognition.aiConfidence || 0),
        origin: String(recognition.origin || input?.source || "scan")
      },
      scanPreview: String(input?.scanPreview || ""),
      cardmarketUrl: String(input?.cardmarketUrl || ""),
      addedToCollection: Boolean(input?.addedToCollection)
    };
  }

  async function recordScan(input) {
    const record = cleanRecord(input);
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(HISTORY_STORE).put(record);
    await done;
    await pruneHistory();
    window.CardDexCore?.emit?.("history-changed", { id: record.id, action: "record" });
    return record;
  }

  async function getHistory(limit = HISTORY_LIMIT) {
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readonly");
    const done = transactionDone(tx);
    const records = await requestToPromise(tx.objectStore(HISTORY_STORE).getAll());
    await done;
    return records
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, Math.max(1, Number(limit) || HISTORY_LIMIT));
  }

  async function getHistoryRecord(id) {
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readonly");
    const done = transactionDone(tx);
    const record = await requestToPromise(tx.objectStore(HISTORY_STORE).get(id));
    await done;
    return record || null;
  }

  async function updateHistory(id, updates = {}) {
    const current = await getHistoryRecord(id);
    if (!current) return null;
    const next = cleanRecord({ ...current, ...updates, id: current.id, createdAt: current.createdAt });
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(HISTORY_STORE).put(next);
    await done;
    window.CardDexCore?.emit?.("history-changed", { id, action: "update" });
    return next;
  }

  async function deleteHistory(id) {
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(HISTORY_STORE).delete(id);
    await done;
    window.CardDexCore?.emit?.("history-changed", { id, action: "delete" });
  }

  async function clearHistory() {
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const done = transactionDone(tx);
    tx.objectStore(HISTORY_STORE).clear();
    await done;
    window.CardDexCore?.emit?.("history-changed", { action: "clear" });
  }

  async function pruneHistory() {
    const records = await getHistory(HISTORY_LIMIT + 1000);
    if (records.length <= HISTORY_LIMIT) return;
    const stale = records.slice(HISTORY_LIMIT);
    const db = await openDatabase();
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore(HISTORY_STORE);
    stale.forEach(record => store.delete(record.id));
    await done;
  }

  async function getCollections() {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readonly");
    const done = transactionDone(tx);
    const collections = await requestToPromise(tx.objectStore("collections").getAll());
    await done;
    return collections.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || String(a.name).localeCompare(String(b.name), "de"));
  }

  async function getDashboardData() {
    const db = await openDatabase();
    const stores = ["collections", "entries", HISTORY_STORE];
    const tx = db.transaction(stores, "readonly");
    const done = transactionDone(tx);
    const [collections, entries, history] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("entries").getAll()),
      requestToPromise(tx.objectStore(HISTORY_STORE).getAll())
    ]);
    await done;

    const todayKey = window.CardDexCore?.localDayKey?.() || "";
    const sortedHistory = history.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    const todayScans = sortedHistory.filter(record => window.CardDexCore?.localDayKey?.(record.createdAt) === todayKey);
    const collectionById = new Map(collections.map(collection => [collection.id, collection]));
    const ownedEntries = entries.filter(entry => collectionById.get(entry.collectionId)?.type !== "wishlist");
    const wishlistEntries = entries.filter(entry => collectionById.get(entry.collectionId)?.type === "wishlist");
    const totalCopies = ownedEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
    const uniqueCards = new Set(ownedEntries.map(entry => entry.cardId).filter(Boolean)).size;
    const countsByCollection = new Map();
    entries.forEach(entry => countsByCollection.set(entry.collectionId, (countsByCollection.get(entry.collectionId) || 0) + Math.max(0, Number(entry.quantity || 0))));

    return {
      collections: collections
        .map(collection => ({ ...collection, count: countsByCollection.get(collection.id) || 0 }))
        .sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || b.count - a.count),
      collectionCount: collections.filter(collection => collection.type !== "wishlist").length,
      wishlistCount: wishlistEntries.length,
      wishlistCopies: wishlistEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0),
      totalCopies,
      uniqueCards,
      historyCount: sortedHistory.length,
      todayScans: todayScans.length,
      verifiedToday: todayScans.filter(record => record.status === "verified").length,
      reviewToday: todayScans.filter(record => record.status !== "verified").length,
      verifiedTotal: sortedHistory.filter(record => record.status === "verified").length,
      provisionalTotal: sortedHistory.filter(record => record.status === "provisional").length,
      reviewTotal: sortedHistory.filter(record => record.status === "review").length,
      recentHistory: sortedHistory.slice(0, 5)
    };
  }

  async function init() {
    await openDatabase();
    window.CardDexCore?.emit?.("library-ready", { version: DB_VERSION });
  }

  window.CardDexLibraryEngine = Object.freeze({
    init,
    recordScan,
    getHistory,
    getHistoryRecord,
    updateHistory,
    deleteHistory,
    clearHistory,
    getCollections,
    getDashboardData
  });
})();
