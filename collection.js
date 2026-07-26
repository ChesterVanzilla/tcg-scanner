"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 2;
  const API_BASE = "https://api.tcgdex.net/v2";
  const POKEMON_TCG_API = "https://api.pokemontcg.io/v2";
  const DEFAULT_COLLECTION_ID = "default-collection";
  const WISHLIST_COLLECTION_ID = "wishlist";
  const ACTIVE_COLLECTION_KEY = "carddex-v67-active-collection";
  const BACKUP_VERSION = 5;
  const CARD_DATA_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
  const CARDMARKET_LINK_MIGRATION_KEY = "carddex-v685-cardmarket-link-migration";
  const COLLECTION_VIEW_KEY = "carddex-v611-collection-view";
  const COLLECTION_FILTER_VALUES = new Set(["all", "duplicates", "single", "verified", "provisional", "review", "notes", "purchase", "priority-high", "target-price"]);
  const COLLECTION_SORT_VALUES = new Set(["name-asc", "name-desc", "set-number", "quantity-desc", "newest", "purchase-desc", "priority-desc", "target-price-desc"]);
  const collectionCollator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

  const LANGUAGE_OPTIONS = [
    ["de", "Deutsch"],
    ["en", "Englisch"],
    ["ja", "Japanisch"],
    ["fr", "Französisch"],
    ["it", "Italienisch"],
    ["es", "Spanisch"],
    ["pt", "Portugiesisch"],
    ["ko", "Koreanisch"],
    ["zh", "Chinesisch"]
  ];

  const CONDITION_OPTIONS = [
    ["MT", "MT – Mint"],
    ["NM", "NM – Near Mint"],
    ["EX", "EX – Excellent"],
    ["GD", "GD – Good"],
    ["LP", "LP – Light Played"],
    ["PL", "PL – Played"],
    ["PO", "PO – Poor"]
  ];

  const VARIANT_OPTIONS = [
    ["normal", "Normal"],
    ["holo", "Holo"],
    ["reverse", "Reverse Holo"],
    ["firstEdition", "1. Auflage"],
    ["wPromo", "Promo-Variante"],
    ["other", "Sonstige Variante"]
  ];

  let dbPromise = null;
  let activeCollectionId = localStorage.getItem(ACTIVE_COLLECTION_KEY) || DEFAULT_COLLECTION_ID;
  let activeDetailEntryId = null;
  let lastToastTimer = null;
  let collectionRenderToken = 0;
  const cardFetchPromises = new Map();
  const imageRepairAttempts = new Set();
  let collectionViewState = loadCollectionViewState();
  let collectionSearchTimer = null;

  const $ = selector => document.querySelector(selector);

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
        if (!db.objectStoreNames.contains("collections")) {
          db.createObjectStore("collections", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("cards")) {
          db.createObjectStore("cards", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("entries")) {
          const store = db.createObjectStore("entries", { keyPath: "id" });
          store.createIndex("collectionId", "collectionId", { unique: false });
          store.createIndex("cardId", "cardId", { unique: false });
        }
        if (!db.objectStoreNames.contains("scanHistory")) {
          const historyStore = db.createObjectStore("scanHistory", { keyPath: "id" });
          historyStore.createIndex("createdAt", "createdAt", { unique: false });
          historyStore.createIndex("status", "status", { unique: false });
          historyStore.createIndex("cardId", "cardId", { unique: false });
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
      request.onblocked = () => reject(new Error("Die lokale Datenbank wird noch von einer alten App-Version verwendet."));
    });
    return dbPromise;
  }

  async function requestPersistentStorage() {
    try {
      if (navigator.storage?.persist) await navigator.storage.persist();
    } catch {
      // Manche iOS-Versionen unterstützen die Abfrage nicht vollständig.
    }
  }

  async function ensureDefaultCollection() {
    const existing = await getCollection(DEFAULT_COLLECTION_ID);
    if (!existing) {
      const db = await openDatabase();
      const tx = db.transaction("collections", "readwrite");
      const done = transactionDone(tx);
      tx.objectStore("collections").put({
        id: DEFAULT_COLLECTION_ID,
        name: "Meine Sammlung",
        type: "collection",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDefault: true
      });
      await done;
    }
    const collections = await getCollections();
    if (!collections.some(item => item.id === activeCollectionId)) {
      activeCollectionId = collections[0]?.id || DEFAULT_COLLECTION_ID;
      localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    }
  }

  async function ensureWishlistCollection() {
    const existing = await getCollection(WISHLIST_COLLECTION_ID);
    if (existing) {
      if (existing.type !== "wishlist") {
        const db = await openDatabase();
        const tx = db.transaction("collections", "readwrite");
        const done = transactionDone(tx);
        tx.objectStore("collections").put({ ...existing, type: "wishlist", name: existing.name || "Wunschliste", isSystem: true, updatedAt: new Date().toISOString() });
        await done;
      }
      return;
    }
    const db = await openDatabase();
    const tx = db.transaction("collections", "readwrite");
    const done = transactionDone(tx);
    const now = new Date().toISOString();
    tx.objectStore("collections").put({
      id: WISHLIST_COLLECTION_ID,
      name: "Wunschliste",
      type: "wishlist",
      createdAt: now,
      updatedAt: now,
      isDefault: false,
      isSystem: true
    });
    await done;
  }

  function collectionSortRank(collection) {
    if (collection?.isDefault) return 0;
    if (collection?.type === "wishlist") return 1;
    return 2;
  }

  async function getCollections() {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readonly");
    const done = transactionDone(tx);
    const result = await requestToPromise(tx.objectStore("collections").getAll());
    await done;
    return result.sort((a, b) => collectionSortRank(a) - collectionSortRank(b) || a.name.localeCompare(b.name, "de"));
  }

  async function getCollection(collectionId) {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readonly");
    const done = transactionDone(tx);
    const collection = await requestToPromise(tx.objectStore("collections").get(collectionId));
    await done;
    return collection || null;
  }

  async function getRawEntry(entryId) {
    const db = await openDatabase();
    const tx = db.transaction("entries", "readonly");
    const done = transactionDone(tx);
    const entry = await requestToPromise(tx.objectStore("entries").get(entryId));
    await done;
    return entry || null;
  }

  async function getEntryKeysByCollection(collectionId) {
    const db = await openDatabase();
    const tx = db.transaction("entries", "readonly");
    const done = transactionDone(tx);
    const keys = await requestToPromise(tx.objectStore("entries").index("collectionId").getAllKeys(collectionId));
    await done;
    return keys;
  }

  async function getCard(cardId) {
    const db = await openDatabase();
    const tx = db.transaction("cards", "readonly");
    const done = transactionDone(tx);
    const card = await requestToPromise(tx.objectStore("cards").get(cardId));
    await done;
    return card || null;
  }

  async function putCard(card) {
    if (!card?.id) return null;
    const db = await openDatabase();
    const tx = db.transaction("cards", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("cards").put(card);
    await done;
    return card;
  }

  async function getEntries(collectionId = activeCollectionId) {
    const db = await openDatabase();
    const tx = db.transaction(["entries", "cards"], "readonly");
    const done = transactionDone(tx);
    const [entries, cards] = await Promise.all([
      requestToPromise(tx.objectStore("entries").index("collectionId").getAll(collectionId)),
      requestToPromise(tx.objectStore("cards").getAll())
    ]);
    await done;
    const cardsById = new Map(cards.map(card => [card.id, card]));
    return entries
      .map(entry => ({ ...entry, card: cardsById.get(entry.cardId) || null }))
      .sort((a, b) => String(a.card?.name || "").localeCompare(String(b.card?.name || ""), "de"));
  }

  async function getEntry(entryId) {
    const entry = await getRawEntry(entryId);
    if (!entry) return null;
    const [card, collection] = await Promise.all([
      getCard(entry.cardId),
      getCollection(entry.collectionId)
    ]);
    return { ...entry, card: card || null, collection: collection || null };
  }

  function inferDefaultVariant(card) {
    const variants = card?.variants || {};
    if (variants.normal) return "normal";
    if (variants.holo) return "holo";
    if (variants.reverse) return "reverse";
    if (variants.firstEdition) return "firstEdition";
    if (variants.wPromo) return "wPromo";
    return "normal";
  }

  function normalizeCard(card) {
    const sourceId = String(card.id || `${card.set?.id || card._setBrief?.id || "set"}-${card.localId || "unknown"}`);
    return {
      id: sourceId,
      source: card.source || card._externalSource || "tcgdex",
      dataLanguage: card._dataLanguage || card.dataLanguage || "",
      name: card.name || "Unbekannte Karte",
      localId: String(card.localId || ""),
      setId: card.set?.id || card._setBrief?.id || card.setId || "",
      setName: card.set?.name || card._setBrief?.name || card.setName || "Set nicht angegeben",
      officialTotal: card.set?.cardCount?.official || card._setBrief?.cardCount?.official || card.officialTotal || null,
      image: normalizeImageBase(card.image || ""),
      directImage: Boolean(card._directImage || card.directImage),
      scanImage: String(card.scanImage || ""),
      verificationStatus: card.verificationStatus || "verified",
      confidence: Number(card.confidence || 0),
      imageLanguage: card.imageLanguage || card._dataLanguage || "",
      rarity: card.rarity || "",
      category: card.category || "",
      illustrator: card.illustrator || "",
      hp: card.hp ?? null,
      types: Array.isArray(card.types) ? card.types : [],
      variants: card.variants || null,
      thirdParty: card.thirdParty || null,
      pricing: sanitizePricing(card.pricing),
      cardmarketProductId: window.CardDexCore?.extractCardmarketProductId?.(card) || "",
      cardmarketUrl: normalizeCardmarketUrl(card.cardmarketUrl || card.pricing?.cardmarket?.url || ""),
      cardmarketSetCode: window.CardDexCore?.deriveCardmarketSetCode?.(card) || normalizeCardmarketSetCode(card.cardmarketSetCode || card.set?.ptcgoCode || ""),
      pokemonTcgId: String(card.pokemonTcgId || ""),
      englishName: card.englishName || "",
      cardmarketCheckedAt: card.cardmarketCheckedAt || "",
      detailsFetchedAt: card.detailsFetchedAt || "",
      updatedAt: new Date().toISOString()
    };
  }

  async function addCard(card, options = {}) {
    const collectionId = options.collectionId || activeCollectionId;
    const normalized = normalizeCard(card);
    const language = options.language || card._dataLanguage || "de";
    const variant = options.variant || inferDefaultVariant(card);
    const entryId = buildEntryId(collectionId, normalized.id, language, variant);
    const [existing, collection] = await Promise.all([
      getRawEntry(entryId),
      getCollection(collectionId)
    ]);
    const isWishlist = collection?.type === "wishlist";
    const db = await openDatabase();
    const tx = db.transaction(["cards", "entries", "collections"], "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("cards").put(normalized);
    const entryStore = tx.objectStore("entries");
    const now = new Date().toISOString();
    const quantity = Math.max(1, Number(existing?.quantity || 0) + Number(options.quantity || 1));
    entryStore.put({
      id: entryId,
      collectionId,
      cardId: normalized.id,
      quantity,
      language: language || existing?.language || "de",
      variant: variant || existing?.variant || "normal",
      condition: existing?.condition || "NM",
      purchasePrice: existing?.purchasePrice ?? null,
      purchaseDate: existing?.purchaseDate || "",
      notes: existing?.notes || "",
      priority: isWishlist ? normalizePriority(options.priority || existing?.priority || "medium") : (existing?.priority || ""),
      targetPrice: isWishlist ? (parseLocalizedNumber(options.targetPrice ?? existing?.targetPrice) ?? null) : (existing?.targetPrice ?? null),
      tradeQuantity: isWishlist ? 0 : Math.max(0, Number(existing?.tradeQuantity || 0)),
      soldQuantity: isWishlist ? 0 : Math.max(0, Number(existing?.soldQuantity || 0)),
      tradedAwayQuantity: isWishlist ? 0 : Math.max(0, Number(existing?.tradedAwayQuantity || 0)),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      syncStatus: "local"
    });
    // Wird genau dieselbe Sprach-/Variantenkombination gekauft oder gescannt,
    // verschwindet sie automatisch von der Wunschliste. Andere Varianten bleiben erhalten.
    if (!isWishlist) {
      entryStore.delete(buildEntryId(WISHLIST_COLLECTION_ID, normalized.id, language, variant));
    }
    const collectionStore = tx.objectStore("collections");
    if (collection) collectionStore.put({ ...collection, updatedAt: now });
    await done;
    await refreshAll();
    toast(isWishlist ? `${normalized.name} wurde ${existing ? "erneut " : ""}zur Wunschliste hinzugefügt.` : `${normalized.name} wurde ${existing ? "erneut " : ""}zur Sammlung hinzugefügt.`);
    if (!normalized.image && normalized.source !== "scan" && normalized.verificationStatus !== "provisional") void repairCardData(normalized.id, language, false, true).then(updated => {
      if (updated?.image) renderCollection();
    });
    return quantity;
  }

  async function setQuantity(entryId, quantity, options = {}) {
    const entry = await getRawEntry(entryId);
    if (!entry) return;
    const db = await openDatabase();
    const tx = db.transaction("entries", "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("entries");
    if (quantity <= 0) store.delete(entryId);
    else {
      const nextQuantity = Math.max(1, Math.round(Number(quantity) || 1));
      store.put({
        ...entry,
        quantity: nextQuantity,
        tradeQuantity: Math.min(nextQuantity, Math.max(0, Number(entry.tradeQuantity || 0))),
        updatedAt: new Date().toISOString(),
        syncStatus: "local"
      });
    }
    await done;
    if (!options.skipRefresh) await refreshAll();
  }

  async function updateEntryDetails(entryId, updates) {
    const current = await getEntry(entryId);
    if (!current) throw new Error("Der Sammlungseintrag wurde nicht gefunden.");

    const language = normalizeOptionValue(updates.language, LANGUAGE_OPTIONS, current.language || "de");
    const variant = normalizeOptionValue(updates.variant, VARIANT_OPTIONS, current.variant || "normal");
    const condition = normalizeOptionValue(updates.condition, CONDITION_OPTIONS, current.condition || "NM");
    const quantity = Math.max(1, Math.round(Number(updates.quantity) || 1));
    const purchasePrice = parseLocalizedNumber(updates.purchasePrice);
    const purchaseDate = String(updates.purchaseDate || "");
    const notes = String(updates.notes || "").trim();
    const isWishlist = current.collection?.type === "wishlist";
    const priority = isWishlist ? normalizePriority(updates.priority || current.priority || "medium") : (current.priority || "");
    const targetPrice = isWishlist ? parseLocalizedNumber(updates.targetPrice) : (current.targetPrice ?? null);
    const nextEntryId = buildEntryId(current.collectionId, current.cardId, language, variant);
    const now = new Date().toISOString();

    const [collision, collectionRecord] = await Promise.all([
      nextEntryId !== entryId ? getRawEntry(nextEntryId) : Promise.resolve(null),
      getCollection(current.collectionId)
    ]);
    const { card: _card, collection: _collection, ...currentRaw } = current;
    const mergedQuantity = collision ? Number(collision.quantity || 0) + quantity : quantity;
    const mergedTradeQuantity = isWishlist ? 0 : Math.min(
      mergedQuantity,
      Math.max(0, Number(currentRaw.tradeQuantity || 0)) + Math.max(0, Number(collision?.tradeQuantity || 0))
    );
    const mergedSoldQuantity = isWishlist ? 0 : Math.max(0, Number(currentRaw.soldQuantity || 0)) + Math.max(0, Number(collision?.soldQuantity || 0));
    const mergedTradedAwayQuantity = isWishlist ? 0 : Math.max(0, Number(currentRaw.tradedAwayQuantity || 0)) + Math.max(0, Number(collision?.tradedAwayQuantity || 0));
    const db = await openDatabase();
    const tx = db.transaction(["entries", "collections"], "readwrite");
    const done = transactionDone(tx);
    const entryStore = tx.objectStore("entries");

    if (nextEntryId !== entryId) entryStore.delete(entryId);
    entryStore.put({
      ...currentRaw,
      ...(collision || {}),
      id: nextEntryId,
      collectionId: current.collectionId,
      cardId: current.cardId,
      quantity: mergedQuantity,
      language,
      variant,
      condition,
      purchasePrice,
      purchaseDate,
      notes,
      priority,
      targetPrice,
      tradeQuantity: mergedTradeQuantity,
      soldQuantity: mergedSoldQuantity,
      tradedAwayQuantity: mergedTradedAwayQuantity,
      createdAt: collision?.createdAt || current.createdAt || now,
      updatedAt: now,
      syncStatus: "local"
    });

    const collectionStore = tx.objectStore("collections");
    if (collectionRecord) collectionStore.put({ ...collectionRecord, updatedAt: now });
    await done;

    activeDetailEntryId = nextEntryId;
    await refreshAll();
    toast(collision ? "Die Einträge wurden zusammengeführt und gespeichert." : "Kartendetails wurden gespeichert.");
    return nextEntryId;
  }

  async function deleteEntry(entryId, askForConfirmation = true) {
    const current = await getEntry(entryId);
    if (!current) return false;
    if (askForConfirmation && !confirm(current.collection?.type === "wishlist" ? `„${current.card?.name || "Diese Karte"}“ von der Wunschliste entfernen?` : `„${current.card?.name || "Diese Karte"}“ vollständig aus der Sammlung entfernen?`)) return false;
    const db = await openDatabase();
    const tx = db.transaction("entries", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("entries").delete(entryId);
    await done;
    await refreshAll();
    toast(current.collection?.type === "wishlist" ? "Karte wurde von der Wunschliste entfernt." : "Karte wurde aus der Sammlung entfernt.");
    return true;
  }

  async function removeWishlistEntries(entryIds = [], options = {}) {
    const ids = [...new Set((Array.isArray(entryIds) ? entryIds : []).map(value => String(value || "").trim()).filter(Boolean))];
    if (!ids.length) return 0;
    const records = await Promise.all(ids.map(getRawEntry));
    const wishlistIds = records
      .filter(entry => entry?.collectionId === WISHLIST_COLLECTION_ID)
      .map(entry => entry.id);
    if (!wishlistIds.length) return 0;

    const db = await openDatabase();
    const tx = db.transaction(["entries", "collections"], "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("entries");
    wishlistIds.forEach(id => store.delete(id));
    const collection = await requestToPromise(tx.objectStore("collections").get(WISHLIST_COLLECTION_ID));
    if (collection) tx.objectStore("collections").put({ ...collection, updatedAt: new Date().toISOString() });
    await done;
    if (!options.skipRefresh) await refreshAll();
    if (!options.silent) toast(`${wishlistIds.length} ${wishlistIds.length === 1 ? "Eintrag wurde" : "Einträge wurden"} von der Wunschliste entfernt.`);
    return wishlistIds.length;
  }

  async function createCollection(name, type = "collection") {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Bitte einen Namen eingeben.");
    const id = `collection-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const db = await openDatabase();
    const tx = db.transaction("collections", "readwrite");
    const done = transactionDone(tx);
    const now = new Date().toISOString();
    tx.objectStore("collections").put({ id, name: cleanName, type, createdAt: now, updatedAt: now, isDefault: false });
    await done;
    activeCollectionId = id;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, id);
    await refreshAll();
    toast(`Sammlung „${cleanName}“ wurde erstellt.`);
  }

  async function renameActiveCollection() {
    const collections = await getCollections();
    const current = collections.find(item => item.id === activeCollectionId);
    if (!current) return;
    const nextName = prompt("Neuer Name der Sammlung:", current.name)?.trim();
    if (!nextName || nextName === current.name) return;
    const db = await openDatabase();
    const tx = db.transaction("collections", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("collections").put({ ...current, name: nextName, updatedAt: new Date().toISOString() });
    await done;
    await refreshAll();
  }

  async function deleteActiveCollection() {
    if (activeCollectionId === DEFAULT_COLLECTION_ID || activeCollectionId === WISHLIST_COLLECTION_ID) {
      toast(activeCollectionId === WISHLIST_COLLECTION_ID ? "Die Wunschliste kann nicht gelöscht werden." : "Die Standardsammlung kann nicht gelöscht werden.", true);
      return;
    }
    const collections = await getCollections();
    const current = collections.find(item => item.id === activeCollectionId);
    if (!current || !confirm(`Sammlung „${current.name}“ samt Einträgen löschen?`)) return;
    const keys = await getEntryKeysByCollection(activeCollectionId);
    const db = await openDatabase();
    const tx = db.transaction(["collections", "entries"], "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("collections").delete(activeCollectionId);
    const entryStore = tx.objectStore("entries");
    keys.forEach(key => entryStore.delete(key));
    await done;
    activeCollectionId = DEFAULT_COLLECTION_ID;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    await refreshAll();
  }

  async function exportBackup() {
    const db = await openDatabase();
    const tx = db.transaction(["collections", "cards", "entries", "scanHistory"], "readonly");
    const done = transactionDone(tx);
    const [collections, cards, entries, scanHistory] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("cards").getAll()),
      requestToPromise(tx.objectStore("entries").getAll()),
      requestToPromise(tx.objectStore("scanHistory").getAll())
    ]);
    await done;
    const backup = {
      app: "CardDex AI",
      appVersion: window.CardDexCore?.version || "6.14",
      setProjects: window.CardDexSetEngine?.getSetProjects?.() || [],
      setProjectSettings: window.CardDexSetEngine?.getAllProjectSettings?.() || {},
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      activeCollectionId,
      collections,
      cards,
      entries,
      scanHistory
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `CardDexAI_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Sicherung wurde exportiert.");
  }

  async function importBackup(file) {
    const raw = await file.text();
    const backup = JSON.parse(raw);
    if (backup?.app !== "CardDex AI" || !Array.isArray(backup.collections) || !Array.isArray(backup.entries)) {
      throw new Error("Die Datei ist keine gültige CardDex-AI-Sicherung.");
    }
    if (!confirm("Vorhandene Sammlungsdaten durch diese Sicherung ersetzen?")) return;
    const db = await openDatabase();
    const tx = db.transaction(["collections", "cards", "entries", "scanHistory"], "readwrite");
    const done = transactionDone(tx);
    for (const name of ["collections", "cards", "entries", "scanHistory"]) tx.objectStore(name).clear();
    backup.collections.forEach(item => tx.objectStore("collections").put(item));
    (backup.cards || []).forEach(item => tx.objectStore("cards").put(normalizeCard(item)));
    backup.entries.forEach(item => tx.objectStore("entries").put({
      condition: "NM",
      variant: "normal",
      language: "de",
      purchasePrice: null,
      purchaseDate: "",
      notes: "",
      priority: "",
      targetPrice: null,
      tradeQuantity: 0,
      soldQuantity: 0,
      tradedAwayQuantity: 0,
      ...item
    }));
    (backup.scanHistory || []).forEach(item => tx.objectStore("scanHistory").put(item));
    await done;
    activeCollectionId = backup.activeCollectionId || DEFAULT_COLLECTION_ID;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    await ensureDefaultCollection();
    await ensureWishlistCollection();
    if (Array.isArray(backup.setProjects)) window.CardDexSetEngine?.replaceSetProjects?.(backup.setProjects);
    if (backup.setProjectSettings && typeof backup.setProjectSettings === "object") {
      window.CardDexSetEngine?.replaceAllProjectSettings?.(backup.setProjectSettings);
    }
    await refreshAll();
    toast("Sicherung wurde vollständig wiederhergestellt.");
  }

  function toast(message, isError = false) {
    const element = $("#collectionToast");
    if (!element) return;
    element.textContent = message;
    element.classList.toggle("error", isError);
    element.classList.add("show");
    clearTimeout(lastToastTimer);
    lastToastTimer = setTimeout(() => element.classList.remove("show"), 2800);
  }

  async function renderCollectionSelectors() {
    const collections = await getCollections();
    const selectors = [$("#activeCollectionSelect"), ...document.querySelectorAll(".result-collection-select")].filter(Boolean);
    selectors.forEach(select => {
      const availableCollections = select.id === "activeCollectionSelect"
        ? collections
        : collections.filter(collection => collection.type !== "wishlist");
      const chosen = select.value || activeCollectionId;
      select.innerHTML = "";
      availableCollections.forEach(collection => {
        const option = document.createElement("option");
        option.value = collection.id;
        option.textContent = collection.type === "wishlist" ? `★ ${collection.name}` : collection.name;
        select.append(option);
      });
      const fallbackId = availableCollections.some(item => item.id === activeCollectionId)
        ? activeCollectionId
        : availableCollections[0]?.id || "";
      select.value = availableCollections.some(item => item.id === chosen) ? chosen : fallbackId;
    });
  }

  function loadCollectionViewState() {
    const fallback = { query: "", filter: "all", language: "all", sort: "name-asc" };
    try {
      const saved = JSON.parse(localStorage.getItem(COLLECTION_VIEW_KEY) || "null");
      if (!saved || typeof saved !== "object") return fallback;
      return {
        query: String(saved.query || "").slice(0, 120),
        filter: COLLECTION_FILTER_VALUES.has(saved.filter) ? saved.filter : "all",
        language: /^[a-z]{2}$/i.test(String(saved.language || "")) ? String(saved.language).toLowerCase() : "all",
        sort: COLLECTION_SORT_VALUES.has(saved.sort) ? saved.sort : "name-asc"
      };
    } catch {
      return fallback;
    }
  }

  function saveCollectionViewState() {
    try {
      localStorage.setItem(COLLECTION_VIEW_KEY, JSON.stringify(collectionViewState));
    } catch {
      // Die Sortier- und Filtereinstellungen sind nicht kritisch.
    }
  }

  function normalizeSearchValue(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("de")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function getEntryVerificationStatus(entry) {
    const value = String(entry?.card?.verificationStatus || "verified").toLowerCase();
    if (value === "provisional") return "provisional";
    if (value === "review") return "review";
    return "verified";
  }

  function getCollectionSearchHaystack(entry) {
    const card = entry.card || {};
    return normalizeSearchValue([
      card.name,
      card.englishName,
      card.setName,
      card.setId,
      card.localId,
      card.officialTotal,
      card.rarity,
      card.category,
      card.illustrator,
      entry.language,
      variantLabel(entry.variant),
      entry.condition,
      entry.priority,
      entry.targetPrice,
      entry.notes
    ].filter(Boolean).join(" "));
  }

  function entryMatchesCollectionFilter(entry) {
    const quantity = Math.max(1, Number(entry.quantity || 1));
    const status = getEntryVerificationStatus(entry);
    switch (collectionViewState.filter) {
      case "duplicates": return quantity > 1;
      case "single": return quantity === 1;
      case "verified": return status === "verified";
      case "provisional": return status === "provisional";
      case "review": return status === "review";
      case "notes": return Boolean(String(entry.notes || "").trim());
      case "purchase": return entry.purchasePrice !== null && entry.purchasePrice !== "" && Number.isFinite(Number(entry.purchasePrice));
      case "priority-high": return normalizePriority(entry.priority) === "high";
      case "target-price": return entry.targetPrice !== null && entry.targetPrice !== "" && Number.isFinite(Number(entry.targetPrice));
      default: return true;
    }
  }

  function compareCollectionEntries(a, b) {
    const cardA = a.card || {};
    const cardB = b.card || {};
    const nameCompare = collectionCollator.compare(cardA.name || "", cardB.name || "");
    switch (collectionViewState.sort) {
      case "name-desc": return -nameCompare;
      case "set-number": {
        const setCompare = collectionCollator.compare(cardA.setName || cardA.setId || "", cardB.setName || cardB.setId || "");
        if (setCompare) return setCompare;
        const numberCompare = collectionCollator.compare(cardA.localId || "", cardB.localId || "");
        return numberCompare || nameCompare;
      }
      case "quantity-desc": {
        const quantityCompare = Number(b.quantity || 1) - Number(a.quantity || 1);
        return quantityCompare || nameCompare;
      }
      case "newest": {
        const dateCompare = (Date.parse(b.updatedAt || b.createdAt || "") || 0) - (Date.parse(a.updatedAt || a.createdAt || "") || 0);
        return dateCompare || nameCompare;
      }
      case "purchase-desc": {
        const priceA = a.purchasePrice !== null && a.purchasePrice !== "" && Number.isFinite(Number(a.purchasePrice)) ? Number(a.purchasePrice) : -1;
        const priceB = b.purchasePrice !== null && b.purchasePrice !== "" && Number.isFinite(Number(b.purchasePrice)) ? Number(b.purchasePrice) : -1;
        return priceB - priceA || nameCompare;
      }
      case "priority-desc": {
        const rank = { high: 3, medium: 2, low: 1 };
        return (rank[normalizePriority(b.priority)] || 0) - (rank[normalizePriority(a.priority)] || 0) || nameCompare;
      }
      case "target-price-desc": {
        const priceA = hasStoredNumber(a.targetPrice) ? Number(a.targetPrice) : -1;
        const priceB = hasStoredNumber(b.targetPrice) ? Number(b.targetPrice) : -1;
        return priceB - priceA || nameCompare;
      }
      default: return nameCompare;
    }
  }

  function filterAndSortCollectionEntries(entries) {
    const terms = normalizeSearchValue(collectionViewState.query).split(/\s+/).filter(Boolean);
    return entries
      .filter(entry => collectionViewState.language === "all" || String(entry.language || "de").toLowerCase() === collectionViewState.language)
      .filter(entryMatchesCollectionFilter)
      .filter(entry => {
        if (!terms.length) return true;
        const haystack = getCollectionSearchHaystack(entry);
        return terms.every(term => haystack.includes(term));
      })
      .sort(compareCollectionEntries);
  }

  function syncCollectionOrganizerControls(entries, visibleEntries, current) {
    const search = $("#collectionSearchInput");
    const clear = $("#clearCollectionSearchButton");
    const filter = $("#collectionFilterSelect");
    const language = $("#collectionLanguageFilter");
    const sort = $("#collectionSortSelect");
    const summary = $("#collectionFilterSummary");

    if (search && search.value !== collectionViewState.query) search.value = collectionViewState.query;
    if (clear) clear.classList.toggle("visible", Boolean(collectionViewState.query));
    if (filter) filter.value = collectionViewState.filter;
    if (sort) sort.value = collectionViewState.sort;

    if (language) {
      const selected = collectionViewState.language;
      const available = new Set(entries.map(entry => String(entry.language || "de").toLowerCase()));
      language.innerHTML = '<option value="all">Alle Sprachen</option>';
      LANGUAGE_OPTIONS.forEach(([value, label]) => {
        if (!available.has(value) && value !== selected) return;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        language.append(option);
      });
      language.value = [...language.options].some(option => option.value === selected) ? selected : "all";
      if (language.value !== selected) collectionViewState.language = "all";
    }

    document.querySelectorAll("[data-collection-filter]").forEach(button => {
      const active = button.dataset.collectionFilter === collectionViewState.filter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    if (summary) {
      const visibleQuantity = visibleEntries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
      const hasFilter = Boolean(collectionViewState.query) || collectionViewState.filter !== "all" || collectionViewState.language !== "all";
      const noun = current?.type === "wishlist" ? "gesuchte Exemplare" : "Exemplare";
      const location = current?.type === "wishlist" ? "auf der Wunschliste" : "in dieser Sammlung";
      summary.textContent = hasFilter
        ? `${visibleEntries.length} von ${entries.length} verschiedenen Karten · ${visibleQuantity} ${noun} sichtbar.`
        : `${entries.length} verschiedene Karten · ${visibleQuantity} ${noun} ${location}.`;
    }
  }

  function syncCollectionModeUi(current) {
    const isWishlist = current?.type === "wishlist";
    document.body.classList.toggle("wishlist-mode", isWishlist);
    const description = $("#collectionDescription");
    if (description) description.textContent = isWishlist
      ? "Hier sammelst du Karten, die du noch suchst. Menge, Priorität, Wunschzustand und persönlicher Zielpreis werden lokal gespeichert."
      : "Deine Karten werden sicher auf diesem Gerät gespeichert. Tippe eine Karte an, um ihre Details zu bearbeiten. Exportiere regelmäßig eine Sicherung für Gerätewechsel und Neuinstallationen.";
    if ($("#collectionTotalLabel")) $("#collectionTotalLabel").textContent = isWishlist ? "GESUCHT GESAMT" : "KARTEN GESAMT";
    if ($("#collectionUniqueLabel")) $("#collectionUniqueLabel").textContent = isWishlist ? "VERSCHIEDENE" : "VERSCHIEDENE";
    if ($("#collectionThirdLabel")) $("#collectionThirdLabel").textContent = isWishlist ? "HOHE PRIORITÄT" : "DOPPELTE";
    if ($("#collectionVisibleLabel")) $("#collectionVisibleLabel").textContent = "GEFILTERT";
    $("#deleteCollectionButton")?.toggleAttribute("disabled", Boolean(current?.isDefault || isWishlist));

    document.querySelectorAll("[data-wishlist-only]").forEach(option => { option.hidden = !isWishlist; option.disabled = !isWishlist; });
    document.querySelectorAll("[data-collection-only]").forEach(option => { option.hidden = isWishlist; option.disabled = isWishlist; });
    document.querySelectorAll(".wishlist-only-control").forEach(control => control.classList.toggle("hidden", !isWishlist));
    document.querySelectorAll(".collection-only-control").forEach(control => control.classList.toggle("hidden", isWishlist));
    const filterAllowed = isWishlist ? !["duplicates", "single", "purchase"].includes(collectionViewState.filter) : !["priority-high", "target-price"].includes(collectionViewState.filter);
    if (!filterAllowed) collectionViewState.filter = "all";
    const sortAllowed = isWishlist ? collectionViewState.sort !== "purchase-desc" : !["priority-desc", "target-price-desc"].includes(collectionViewState.sort);
    if (!sortAllowed) collectionViewState.sort = "name-asc";
  }

  function resetCollectionOrganizer() {
    collectionViewState = { query: "", filter: "all", language: "all", sort: "name-asc" };
    saveCollectionViewState();
    void renderCollection({ skipRepair: true });
  }

  async function renderCollection(options = {}) {
    const container = $("#collectionCards");
    if (!container) return;
    const renderToken = ++collectionRenderToken;
    const collections = await getCollections();
    const current = collections.find(item => item.id === activeCollectionId) || collections[0];
    if (!current || renderToken !== collectionRenderToken) return;
    activeCollectionId = current.id;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    const entries = await getEntries(activeCollectionId);
    if (renderToken !== collectionRenderToken) return;

    syncCollectionModeUi(current);
    const visibleEntries = filterAndSortCollectionEntries(entries);
    const total = entries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const duplicateCount = current.type === "wishlist"
      ? entries.filter(item => normalizePriority(item.priority) === "high").length
      : entries.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 1) - 1), 0);
    $("#collectionTitle").textContent = current.name;
    $("#collectionTotalCount").textContent = String(total);
    $("#collectionUniqueCount").textContent = String(entries.length);
    if ($("#collectionDuplicateCount")) $("#collectionDuplicateCount").textContent = String(duplicateCount);
    if ($("#collectionVisibleCount")) $("#collectionVisibleCount").textContent = String(visibleEntries.length);
    $("#activeCollectionSelect").value = activeCollectionId;
    $("#deleteCollectionButton").disabled = Boolean(current.isDefault || current.type === "wishlist");
    syncCollectionOrganizerControls(entries, visibleEntries, current);
    container.innerHTML = "";

    if (!entries.length) {
      container.innerHTML = current.type === "wishlist"
        ? `<div class="collection-empty wishlist-empty"><strong>WUNSCHLISTE IST NOCH LEER</strong><p>Füge Karten direkt aus einem Scan, einem Suchergebnis oder der Scannerhistorie hinzu.</p></div>`
        : `<div class="collection-empty"><strong>NOCH KEINE KARTEN REGISTRIERT</strong><p>Scanne oder suche eine Karte und füge sie dieser Sammlung hinzu.</p></div>`;
      return;
    }

    if (!visibleEntries.length) {
      const empty = document.createElement("div");
      empty.className = "collection-empty collection-filter-empty";
      const title = document.createElement("strong");
      title.textContent = "KEINE PASSENDEN KARTEN";
      const text = document.createElement("p");
      text.textContent = "Ändere den Suchbegriff oder setze die Sammlungsfilter zurück.";
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "mini-system-button";
      reset.textContent = "Filter zurücksetzen";
      reset.addEventListener("click", resetCollectionOrganizer);
      empty.append(title, text, reset);
      container.append(empty);
      return;
    }

    visibleEntries.forEach(entry => container.append(createCollectionCard(entry, current)));
    if (!options.skipRepair) void repairMissingCardData(entries, renderToken);
  }

  function createCollectionCard(entry, collection) {
    const card = entry.card || {};
    const article = document.createElement("article");
    article.className = "collection-card";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "collection-card-open";
    openButton.setAttribute("aria-label", `Details zu ${card.name || "dieser Karte"} öffnen`);

    const image = document.createElement("img");
    image.loading = "lazy";
    image.src = getStoredCardImageUrl(card, "low");
    image.alt = card.name || "Pokémon-Karte";
    image.addEventListener("error", () => handleListImageError(image, entry), { once: true });

    const info = document.createElement("div");
    info.className = "collection-card-info";
    const title = document.createElement("h3");
    title.textContent = card.name || "Unbekannte Karte";
    const meta = document.createElement("p");
    meta.textContent = `${card.setName || "Set nicht angegeben"} · Nr. ${card.localId || "–"}${card.officialTotal ? `/${card.officialTotal}` : ""}`;
    const tags = document.createElement("div");
    tags.className = "collection-card-tags";
    const isWishlist = collection?.type === "wishlist";
    [String(entry.language || "de").toUpperCase(), variantLabel(entry.variant), entry.condition || "NM"].forEach(value => {
      const tag = document.createElement("span");
      tag.textContent = value;
      tags.append(tag);
    });
    const quantity = Math.max(1, Number(entry.quantity || 1));
    if (isWishlist) {
      article.classList.add("wishlist-card");
      const priorityTag = document.createElement("span");
      const priority = normalizePriority(entry.priority);
      priorityTag.className = `wishlist-priority-tag ${priority}`;
      priorityTag.textContent = `${priorityLabel(priority).toUpperCase()} PRIORITÄT`;
      tags.append(priorityTag);
      if (hasStoredNumber(entry.targetPrice)) {
        const targetTag = document.createElement("span");
        targetTag.className = "wishlist-target-tag";
        targetTag.textContent = `ZIEL ${formatEuro(entry.targetPrice)}`;
        tags.append(targetTag);
      }
    } else if (quantity > 1) {
      article.classList.add("has-duplicates");
      const duplicateTag = document.createElement("span");
      duplicateTag.className = "collection-duplicate-tag";
      duplicateTag.textContent = `+${quantity - 1} DOPPELT`;
      tags.append(duplicateTag);
    }
    const verificationStatus = getEntryVerificationStatus(entry);
    if (verificationStatus !== "verified") {
      const verificationTag = document.createElement("span");
      verificationTag.className = verificationStatus === "review" ? "collection-review-tag" : "collection-provisional-tag";
      verificationTag.textContent = verificationStatus === "review" ? "PRÜFEN" : "VORLÄUFIG";
      tags.append(verificationTag);
    }
    info.append(title, meta, tags);
    openButton.append(image, info);
    openButton.addEventListener("click", () => openEntryDetail(entry.id));

    const quantityControl = createQuantityControl(entry, isWishlist);
    article.append(openButton, quantityControl);
    return article;
  }

  function createQuantityControl(entry, isWishlist = false) {
    const control = document.createElement("div");
    control.className = "quantity-control";
    control.setAttribute("aria-label", isWishlist ? "Gesuchte Anzahl" : "Anzahl");
    control.dataset.mode = isWishlist ? "wishlist" : "collection";
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Anzahl verringern");
    const quantity = document.createElement("strong");
    quantity.textContent = String(Number(entry.quantity || 1));
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Anzahl erhöhen");
    minus.addEventListener("click", event => {
      event.stopPropagation();
      setQuantity(entry.id, Number(entry.quantity || 1) - 1);
    });
    plus.addEventListener("click", event => {
      event.stopPropagation();
      setQuantity(entry.id, Number(entry.quantity || 1) + 1);
    });
    control.append(minus, quantity, plus);
    return control;
  }

  async function handleListImageError(image, entry) {
    image.src = "icons/card-placeholder.svg";
    const key = `${entry.cardId}:${entry.language}:forced`;
    if (imageRepairAttempts.has(key)) return;
    imageRepairAttempts.add(key);
    const updated = await repairCardData(entry.cardId, entry.language, true, true).catch(() => null);
    const repairedUrl = getCardImageUrl(updated?.image, "low");
    if (repairedUrl) image.src = repairedUrl;
  }

  async function repairMissingCardData(entries, renderToken) {
    const targets = entries.filter(entry => !entry.card?.image);
    if (!targets.length) return;
    let changed = false;
    await mapWithConcurrency(targets, 3, async entry => {
      const key = `${entry.cardId}:${entry.language}:normal`;
      if (imageRepairAttempts.has(key)) return;
      imageRepairAttempts.add(key);
      const updated = await repairCardData(entry.cardId, entry.language, false, true).catch(() => null);
      if (updated?.image) changed = true;
    });
    if (changed && renderToken === collectionRenderToken) await renderCollection({ skipRepair: true });
  }

  async function openEntryDetail(entryId) {
    const entry = await getEntry(entryId);
    if (!entry) {
      toast("Der Sammlungseintrag wurde nicht gefunden.", true);
      return;
    }
    activeDetailEntryId = entryId;
    showDetailSheet();
    renderEntryDetail(entry);

    const card = entry.card || {};
    const isStale = !card.detailsFetchedAt || Date.now() - Date.parse(card.detailsFetchedAt) > CARD_DATA_MAX_AGE;
    const cardmarketMetadataMissing = !getCardmarketDirectUrl(card) && !card.cardmarketSetCode && !isFresh(card.cardmarketCheckedAt);
    if (!card.image || isStale || !card.rarity || !card.illustrator || cardmarketMetadataMissing) {
      setDetailLoading(true, "Kartendaten werden aktualisiert …");
      try {
        await repairCardData(entry.cardId, entry.language, false, true);
        const refreshed = await getEntry(activeDetailEntryId);
        if (refreshed && activeDetailEntryId === refreshed.id) renderEntryDetail(refreshed);
      } catch (error) {
        console.warn("Kartendetails konnten nicht aktualisiert werden:", error);
        setDetailLoading(false, "Kartendaten konnten nicht aktualisiert werden.", true);
      }
    }
  }

  function showDetailSheet() {
    const backdrop = $("#collectionDetailBackdrop");
    const sheet = $("#collectionDetailSheet");
    backdrop?.classList.remove("hidden");
    sheet?.classList.remove("hidden");
    backdrop?.setAttribute("aria-hidden", "false");
    sheet?.setAttribute("aria-hidden", "false");
    document.body.classList.add("collection-detail-open");
    const content = $(".collection-detail-content");
    if (content) content.scrollTop = 0;
    setTimeout(() => {
      if (content) content.scrollTop = 0;
      $("#closeCollectionDetailButton")?.focus();
    }, 20);
  }

  function closeDetailSheet() {
    const backdrop = $("#collectionDetailBackdrop");
    const sheet = $("#collectionDetailSheet");
    backdrop?.classList.add("hidden");
    sheet?.classList.add("hidden");
    backdrop?.setAttribute("aria-hidden", "true");
    sheet?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("collection-detail-open");
    activeDetailEntryId = null;
  }

  function renderEntryDetail(entry) {
    const card = entry.card || {};
    const title = $("#collectionDetailTitle");
    const meta = $("#collectionDetailMeta");
    const image = $("#collectionDetailImage");
    const collectionName = $("#detailCollectionName");
    if (title) title.textContent = card.name || "Unbekannte Karte";
    if (meta) meta.textContent = `${card.setName || "Set nicht angegeben"} · Nr. ${card.localId || "–"}${card.officialTotal ? `/${card.officialTotal}` : ""}`;
    const isWishlist = entry.collection?.type === "wishlist";
    if (collectionName) collectionName.textContent = entry.collection?.name || "Sammlung";
    $("#collectionDetailSheet")?.classList.toggle("wishlist-detail-mode", isWishlist);
    $("#detailPriorityField")?.classList.toggle("hidden", !isWishlist);
    $("#detailTargetPriceField")?.classList.toggle("hidden", !isWishlist);
    $("#detailPurchasePriceField")?.classList.toggle("hidden", isWishlist);
    $("#detailPurchaseDateField")?.classList.toggle("hidden", isWishlist);
    if ($("#detailQuantityLabel")) $("#detailQuantityLabel").textContent = isWishlist ? "Gesuchte Anzahl" : "Anzahl";
    if ($("#deleteCollectionEntryButton")) $("#deleteCollectionEntryButton").textContent = isWishlist ? "Von Wunschliste entfernen" : "Karte aus Sammlung löschen";

    if (image) {
      image.onerror = null;
      image.src = getStoredCardImageUrl(card, "high");
      image.alt = card.name || "Pokémon-Karte";
      image.onerror = () => handleDetailImageError(entry);
    }

    setSelectValue($("#detailLanguage"), entry.language || "de");
    setSelectValue($("#detailVariant"), entry.variant || "normal");
    setSelectValue($("#detailCondition"), entry.condition || "NM");
    if ($("#detailQuantity")) $("#detailQuantity").value = String(Number(entry.quantity || 1));
    if ($("#detailPurchasePrice")) $("#detailPurchasePrice").value = Number.isFinite(Number(entry.purchasePrice)) ? String(entry.purchasePrice).replace(".", ",") : "";
    if ($("#detailPurchaseDate")) $("#detailPurchaseDate").value = entry.purchaseDate || "";
    setSelectValue($("#detailPriority"), normalizePriority(entry.priority));
    if ($("#detailTargetPrice")) $("#detailTargetPrice").value = hasStoredNumber(entry.targetPrice) ? String(entry.targetPrice).replace(".", ",") : "";
    if ($("#detailNotes")) $("#detailNotes").value = entry.notes || "";
    if ($("#detailRarity")) $("#detailRarity").textContent = card.rarity || "Nicht angegeben";
    if ($("#detailIllustrator")) $("#detailIllustrator").textContent = card.illustrator || "Nicht angegeben";
    if ($("#detailCategory")) $("#detailCategory").textContent = card.category || "Nicht angegeben";
    if ($("#detailCardId")) $("#detailCardId").textContent = card.id || entry.cardId;

    renderDetailPrices(card.pricing?.cardmarket);
    updateCardmarketDetailLink(card);
    const hasImage = Boolean(card.image);
    $("#retryCardImageButton")?.classList.toggle("hidden", hasImage);
    setDetailLoading(false, hasImage ? "Kartenbild geladen." : "Für diese Karte ist noch kein Bild verfügbar.", !hasImage);
  }

  async function handleDetailImageError(entry) {
    const image = $("#collectionDetailImage");
    if (image) {
      image.onerror = null;
      image.src = "icons/card-placeholder.svg";
    }
    $("#retryCardImageButton")?.classList.remove("hidden");
    setDetailLoading(true, "Alternatives Kartenbild wird gesucht …");
    try {
      const updated = await repairCardData(entry.cardId, entry.language, true, true);
      const imageUrl = getStoredCardImageUrl(updated, "high");
      if (!imageUrl) throw new Error("Kein alternatives Bild gefunden");
      if (image) {
        image.src = imageUrl;
        image.onerror = () => {
          image.onerror = null;
          image.src = "icons/card-placeholder.svg";
          setDetailLoading(false, "Für diese Karte ist derzeit kein Bild verfügbar.", true);
        };
      }
      $("#retryCardImageButton")?.classList.add("hidden");
      setDetailLoading(false, "Alternatives Kartenbild geladen.");
      await renderCollection({ skipRepair: true });
    } catch {
      setDetailLoading(false, "Für diese Karte ist derzeit kein Bild verfügbar.", true);
    }
  }

  function renderDetailPrices(pricing) {
    const container = $("#detailPriceSummary");
    if (!container) return;
    container.innerHTML = "";
    const values = [
      ["TREND", firstFinite(pricing?.trend, pricing?.["trend-holo"], pricing?.avg)],
      ["AB", firstFinite(pricing?.low, pricing?.["low-holo"])],
      ["30 TAGE", firstFinite(pricing?.avg30, pricing?.["avg30-holo"])]
    ];
    if (!values.some(([, value]) => value !== null)) {
      container.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    values.forEach(([label, value]) => {
      const item = document.createElement("div");
      const labelElement = document.createElement("span");
      const valueElement = document.createElement("strong");
      labelElement.textContent = label;
      valueElement.textContent = value === null ? "–" : formatEuro(value);
      item.append(labelElement, valueElement);
      container.append(item);
    });
  }

  function updateCardmarketDetailLink(card) {
    const link = $("#detailCardmarketLink");
    if (!link) return;
    const direct = getCardmarketDirectUrl(card);
    link.href = window.CardDexCore?.getCardmarketUrl?.(card)
      || `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(buildCardmarketFallbackQuery(card))}`;
    link.textContent = direct ? "Auf Cardmarket öffnen" : "Auf Cardmarket suchen";
    link.onclick = event => {
      event.preventDefault();
      window.CardDexCore?.openCardmarket?.(card, { language: card?.dataLanguage || "de" });
    };
  }

  function setDetailLoading(isLoading, message, isError = false) {
    const status = $("#detailImageStatus");
    const retry = $("#retryCardImageButton");
    if (status) {
      status.textContent = message || "";
      status.classList.toggle("error", isError);
      status.classList.toggle("loading", isLoading);
    }
    if (retry) retry.disabled = isLoading;
  }

  async function saveActiveDetail() {
    if (!activeDetailEntryId) return;
    const saveButton = $("#saveCollectionDetailButton");
    if (saveButton) saveButton.disabled = true;
    try {
      const nextId = await updateEntryDetails(activeDetailEntryId, {
        language: $("#detailLanguage")?.value,
        variant: $("#detailVariant")?.value,
        condition: $("#detailCondition")?.value,
        quantity: $("#detailQuantity")?.value,
        purchasePrice: $("#detailPurchasePrice")?.value,
        purchaseDate: $("#detailPurchaseDate")?.value,
        priority: $("#detailPriority")?.value,
        targetPrice: $("#detailTargetPrice")?.value,
        notes: $("#detailNotes")?.value
      });
      activeDetailEntryId = nextId;
      closeDetailSheet();
    } catch (error) {
      console.error(error);
      toast(error.message || "Kartendetails konnten nicht gespeichert werden.", true);
    } finally {
      if (saveButton) saveButton.disabled = false;
    }
  }

  async function deleteActiveDetail() {
    if (!activeDetailEntryId) return;
    const deleted = await deleteEntry(activeDetailEntryId, true);
    if (deleted) closeDetailSheet();
  }

  async function retryActiveDetailImage() {
    if (!activeDetailEntryId) return;
    const entry = await getEntry(activeDetailEntryId);
    if (!entry) return;
    setDetailLoading(true, "Kartenbild wird erneut gesucht …");
    try {
      await repairCardData(entry.cardId, entry.language, true, true);
      const refreshed = await getEntry(activeDetailEntryId);
      if (refreshed) renderEntryDetail(refreshed);
      await renderCollection({ skipRepair: true });
    } catch {
      setDetailLoading(false, "Für diese Karte ist derzeit kein Bild verfügbar.", true);
    }
  }

  async function repairCardData(cardId, preferredLanguage = "de", forceEnglishImage = false, forceRefresh = false) {
    const existing = await getCard(cardId);
    const cardmarketMetadataReady = getCardmarketDirectUrl(existing) || existing?.cardmarketProductId || existing?.cardmarketSetCode || isFresh(existing?.cardmarketCheckedAt);
    if (!forceRefresh && existing?.image && cardmarketMetadataReady && isFresh(existing.detailsFetchedAt)) return existing;
    const cacheKey = `${cardId}:${preferredLanguage}:${forceEnglishImage ? "forced" : "normal"}`;
    if (cardFetchPromises.has(cacheKey)) return cardFetchPromises.get(cacheKey);

    const promise = (async () => {
      const languageOrder = unique([preferredLanguage, existing?.dataLanguage, "de", "en"].filter(Boolean));
      let primary = null;
      let primaryLanguage = "";
      for (const language of languageOrder) {
        primary = await fetchCardFromLanguage(language, cardId).catch(() => null);
        if (primary) {
          primaryLanguage = language;
          break;
        }
      }

      let imageSource = primary;
      let imageLanguage = primaryLanguage;
      let englishCard = null;
      if ((!primary?.image || forceEnglishImage || !existing?.cardmarketUrl) && primaryLanguage !== "en") {
        englishCard = await fetchEnglishCardFallback(cardId, existing, primary).catch(() => null);
        if (englishCard?.image && (!primary?.image || forceEnglishImage)) {
          imageSource = englishCard;
          imageLanguage = "en";
        }
      } else if (primaryLanguage === "en") {
        englishCard = primary;
      }

      const pokemonFallback = await fetchPokemonApiFallback(existing, primary, englishCard).catch(() => null);
      if (pokemonFallback?.image && (!imageSource?.image || forceEnglishImage)) {
        imageSource = pokemonFallback;
        imageLanguage = "en";
      }

      if (!primary && !imageSource && !pokemonFallback) throw new Error("Kartendaten nicht gefunden");
      const merged = mergeCardData(existing, primary || imageSource || pokemonFallback, primaryLanguage || imageLanguage || "en", imageSource || pokemonFallback, imageLanguage || "en");
      if (pokemonFallback?.cardmarketUrl) merged.cardmarketUrl = pokemonFallback.cardmarketUrl;
      if (pokemonFallback?.cardmarketProductId) merged.cardmarketProductId = pokemonFallback.cardmarketProductId;
      if (pokemonFallback?.cardmarketSetCode) merged.cardmarketSetCode = pokemonFallback.cardmarketSetCode;
      if (pokemonFallback?.pokemonTcgId) merged.pokemonTcgId = pokemonFallback.pokemonTcgId;
      if (pokemonFallback?.englishName) merged.englishName = pokemonFallback.englishName;
      if (pokemonFallback?.pricing) merged.pricing = mergePricing(merged.pricing, pokemonFallback.pricing);
      merged.cardmarketCheckedAt = new Date().toISOString();

      // Eine parallel laufende Reparatur darf ein bereits erfolgreich gespeichertes
      // Direktbild oder einen Cardmarket-Link nicht wieder mit älteren Daten überschreiben.
      const latest = await getCard(cardId);
      const durable = preserveBestExternalData(latest, merged);
      await putCard(durable);
      return durable;
    })().finally(() => cardFetchPromises.delete(cacheKey));

    cardFetchPromises.set(cacheKey, promise);
    return promise;
  }

  async function fetchCardFromLanguage(language, cardId) {
    const response = await fetch(`${API_BASE}/${encodeURIComponent(language)}/cards/${encodeURIComponent(cardId)}`, { cache: "no-store" });
    if (!response.ok) return null;
    const card = await response.json();
    return card?.id ? card : null;
  }

  async function fetchEnglishCardFallback(cardId, existing, primary) {
    const byId = await fetchCardFromLanguage("en", cardId).catch(() => null);
    if (byId?.image) return byId;
    const setId = primary?.set?.id || existing?.setId;
    const localId = primary?.localId || existing?.localId;
    if (!setId || !localId) return byId;
    const response = await fetch(`${API_BASE}/en/sets/${encodeURIComponent(setId)}/${encodeURIComponent(localId)}`, { cache: "no-store" });
    if (!response.ok) return byId;
    const card = await response.json();
    return card?.id ? card : byId;
  }

  async function fetchPokemonApiFallback(existing, primary, englishCard) {
    const number = String(primary?.localId || existing?.localId || "").trim();
    const englishName = String(englishCard?.name || "").trim();
    if (!number) return null;

    let cards = [];
    const directCandidateId = buildPokemonTcgCandidateId(primary || existing);
    if (directCandidateId) {
      const directResponse = await fetch(`${POKEMON_TCG_API}/cards/${encodeURIComponent(directCandidateId)}`, { cache: "no-store" }).catch(() => null);
      if (directResponse?.ok) {
        const directPayload = await directResponse.json();
        if (directPayload?.data) cards = [directPayload.data];
      }
    }

    const cleanNumber = number.replace(/["\:]/g, " ");
    const cleanName = englishName.replace(/["\:]/g, " ");
    const q = englishName ? `number:${cleanNumber} name:${cleanName}*` : `number:${cleanNumber}`;
    let params = new URLSearchParams({ q, pageSize: "20" });
    let response = null;
    let payload = null;
    if (!cards.length) {
      response = await fetch(`${POKEMON_TCG_API}/cards?${params.toString()}`, { cache: "no-store" });
      payload = response.ok ? await response.json() : null;
      cards = Array.isArray(payload?.data) ? payload.data : [];
    }
    if (!cards.length && englishName) {
      params = new URLSearchParams({ q: `number:${cleanNumber}`, pageSize: "50" });
      response = await fetch(`${POKEMON_TCG_API}/cards?${params.toString()}`, { cache: "no-store" });
      payload = response.ok ? await response.json() : null;
      cards = Array.isArray(payload?.data) ? payload.data : [];
    }
    if (!cards.length) return null;
    const normalizedEnglish = normalizeComparableText(englishName);
    const best = cards.map(card => ({ card, score: pokemonFallbackScore(card, existing, normalizedEnglish) }))
      .sort((a, b) => b.score - a.score)[0]?.card;
    if (!best) return null;
    const normalizedMarketUrl = normalizeCardmarketUrl(best.cardmarket?.url);
    return {
      id: existing?.id || `ptcg-${best.id}`,
      name: existing?.name || best.name,
      englishName: best.name || englishName,
      localId: String(best.number || number),
      image: best.images?.large || best.images?.small || "",
      _directImage: true,
      pokemonTcgId: String(best.id || ""),
      cardmarketSetCode: normalizeCardmarketSetCode(best.set?.ptcgoCode || ""),
      cardmarketUrl: normalizedMarketUrl,
      pricing: best.cardmarket?.prices ? { cardmarket: {
        ...(normalizedMarketUrl ? { url: normalizedMarketUrl } : {}),
        trend: best.cardmarket.prices.trendPrice,
        low: best.cardmarket.prices.lowPrice,
        avg30: best.cardmarket.prices.avg30
      }} : null
    };
  }

  function pokemonFallbackScore(card, existing, normalizedEnglish) {
    let score = 0;
    if (String(card.number || "").replace(/^0+/, "") === String(existing?.localId || "").replace(/^0+/, "")) score += 100;
    if (normalizedEnglish && normalizeComparableText(card.name) === normalizedEnglish) score += 120;
    const candidateSetId = toPokemonTcgSetId(card.set?.id || "");
    const existingSetId = toPokemonTcgSetId(existing?.setId || "");
    if (candidateSetId && existingSetId && candidateSetId === existingSetId) score += 220;
    const setText = normalizeComparableText(`${card.set?.id || ""} ${card.set?.name || ""}`);
    const existingSet = normalizeComparableText(`${existing?.setId || ""} ${existing?.setName || ""}`);
    if (existingSet && setText && (setText.includes(existingSet) || existingSet.includes(setText))) score += 80;
    const candidateTotal = Number(card.set?.printedTotal || 0);
    const existingTotal = Number(existing?.officialTotal || 0);
    if (candidateTotal && existingTotal && candidateTotal === existingTotal) score += 55;
    return score;
  }

  function normalizeComparableText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function normalizeCardmarketUrl(value) {
    return window.CardDexCore?.normalizeCardmarketUrl?.(value) || "";
  }

  function sanitizePricing(pricing) {
    if (!pricing || typeof pricing !== "object") return pricing || null;
    const result = { ...pricing };
    if (pricing.cardmarket && typeof pricing.cardmarket === "object") {
      const cardmarket = { ...pricing.cardmarket };
      const directUrl = normalizeCardmarketUrl(cardmarket.url || "");
      if (directUrl) cardmarket.url = directUrl;
      else delete cardmarket.url;
      result.cardmarket = cardmarket;
    }
    return result;
  }

  function normalizeCardmarketSetCode(value) {
    return window.CardDexCore?.normalizeCardmarketSetCode?.(value)
      || String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeCardmarketCollectorNumber(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");
  }

  function toPokemonTcgSetId(value) {
    let id = String(value || "").trim().toLowerCase();
    if (!id) return "";
    const trainerGallery = id.match(/^swsh(\d+)\.5tg$/);
    if (trainerGallery) return `swsh${trainerGallery[1]}tg`;
    id = id.replace(/\.5/g, "pt5");
    return id.replace(/[^a-z0-9]/g, "");
  }

  function buildPokemonTcgCandidateId(card) {
    const setId = toPokemonTcgSetId(card?.set?.id || card?._setBrief?.id || card?.setId || "");
    const number = String(card?.localId || "").trim();
    if (!setId || !/^[a-z0-9-]+$/i.test(number)) return "";
    return `${setId}-${number}`;
  }

  function getCardmarketDirectUrl(card) {
    return window.CardDexCore?.getCardmarketDirectUrl?.(card) || "";
  }

  function buildCardmarketFallbackQuery(card) {
    return window.CardDexCore?.buildCardmarketQuery?.(card)
      || [card?.name, card?.cardmarketSetCode, normalizeCardmarketCollectorNumber(card?.localId)].filter(Boolean).join(" ");
  }

  function mergePricing(current, fallback) {
    if (!current) return sanitizePricing(fallback);
    if (!fallback) return sanitizePricing(current);
    return sanitizePricing({ ...fallback, ...current, cardmarket: { ...(fallback.cardmarket || {}), ...(current.cardmarket || {}) } });
  }

  function preserveBestExternalData(latest, candidate) {
    if (!latest) return candidate;
    const latestDirect = isDirectImageUrl(latest.image) || Boolean(latest.directImage);
    const candidateDirect = isDirectImageUrl(candidate.image) || Boolean(candidate.directImage);
    const result = { ...candidate };

    if (latestDirect && !candidateDirect) {
      result.image = latest.image;
      result.directImage = true;
      result.imageLanguage = latest.imageLanguage || result.imageLanguage;
    }

    const latestMarket = getCardmarketDirectUrl(latest);
    const candidateMarket = getCardmarketDirectUrl(result);
    if (!candidateMarket && latestMarket) result.cardmarketUrl = latestMarket;
    result.cardmarketProductId = result.cardmarketProductId || latest.cardmarketProductId || window.CardDexCore?.extractCardmarketProductId?.(latest) || "";
    result.thirdParty = result.thirdParty || latest.thirdParty || null;

    result.pricing = mergePricing(result.pricing, latest.pricing);
    result.englishName = result.englishName || latest.englishName || "";
    result.cardmarketSetCode = result.cardmarketSetCode || latest.cardmarketSetCode || "";
    result.pokemonTcgId = result.pokemonTcgId || latest.pokemonTcgId || "";
    result.cardmarketCheckedAt = result.cardmarketCheckedAt || latest.cardmarketCheckedAt || "";
    return result;
  }

  function isDirectImageUrl(value) {
    return /^https?:\/\/.+\.(?:webp|png|jpe?g)(?:\?.*)?$/i.test(String(value || ""));
  }

  function mergeCardData(existing, primary, primaryLanguage, imageSource, imageLanguage) {
    const normalizedPrimary = normalizeCard({ ...primary, _dataLanguage: primaryLanguage });
    return {
      ...normalizedPrimary,
      ...existing,
      id: existing?.id || normalizedPrimary.id,
      source: "tcgdex",
      dataLanguage: primaryLanguage || existing?.dataLanguage || "",
      name: primary?.name || existing?.name || normalizedPrimary.name,
      localId: String(primary?.localId || existing?.localId || normalizedPrimary.localId || ""),
      setId: primary?.set?.id || existing?.setId || normalizedPrimary.setId,
      setName: primary?.set?.name || existing?.setName || normalizedPrimary.setName,
      officialTotal: primary?.set?.cardCount?.official || existing?.officialTotal || normalizedPrimary.officialTotal,
      image: normalizeImageBase(
        (existing?.directImage && isDirectImageUrl(existing?.image) && !(imageSource?._directImage || imageSource?.directImage)
          ? existing.image
          : (imageSource?.image || primary?.image || existing?.image || ""))
      ),
      directImage: Boolean(
        (existing?.directImage && isDirectImageUrl(existing?.image)) ||
        imageSource?._directImage || imageSource?.directImage || isDirectImageUrl(imageSource?.image)
      ),
      imageLanguage: imageLanguage || primaryLanguage || existing?.imageLanguage || "",
      rarity: primary?.rarity || existing?.rarity || "",
      category: primary?.category || existing?.category || "",
      illustrator: primary?.illustrator || existing?.illustrator || "",
      hp: primary?.hp ?? existing?.hp ?? null,
      types: Array.isArray(primary?.types) ? primary.types : (existing?.types || []),
      variants: primary?.variants || existing?.variants || null,
      thirdParty: primary?.thirdParty || existing?.thirdParty || null,
      pricing: sanitizePricing(primary?.pricing || existing?.pricing || null),
      cardmarketProductId: window.CardDexCore?.extractCardmarketProductId?.(primary) || existing?.cardmarketProductId || "",
      cardmarketUrl: normalizeCardmarketUrl(primary?.cardmarketUrl || primary?.pricing?.cardmarket?.url || existing?.cardmarketUrl || existing?.pricing?.cardmarket?.url || ""),
      cardmarketSetCode: window.CardDexCore?.deriveCardmarketSetCode?.(primary) || normalizeCardmarketSetCode(primary?.cardmarketSetCode || primary?.set?.ptcgoCode || existing?.cardmarketSetCode || ""),
      pokemonTcgId: String(primary?.pokemonTcgId || existing?.pokemonTcgId || ""),
      englishName: primary?.englishName || existing?.englishName || "",
      cardmarketCheckedAt: existing?.cardmarketCheckedAt || "",
      detailsFetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function refreshAll() {
    await renderCollectionSelectors();
    await renderCollection();
    window.CardDexCore?.emit?.("collection-changed", { collectionId: activeCollectionId });
  }

  function switchView(view) {
    if (window.CardDexLibrary?.switchView) {
      window.CardDexLibrary.switchView(view);
      return;
    }
    const showCollection = view === "collection";
    $("#scannerView")?.classList.toggle("hidden", showCollection);
    $("#collectionView")?.classList.toggle("hidden", !showCollection);
    if (showCollection) renderCollection();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function populateSelectOptions(select, options) {
    if (!select || select.options.length) return;
    options.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
  }

  function wireUi() {
    populateSelectOptions($("#detailLanguage"), LANGUAGE_OPTIONS);
    populateSelectOptions($("#detailCondition"), CONDITION_OPTIONS);
    populateSelectOptions($("#detailVariant"), VARIANT_OPTIONS);

    $("#activeCollectionSelect")?.addEventListener("change", async event => {
      activeCollectionId = event.target.value;
      localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
      await refreshAll();
    });
    $("#createCollectionButton")?.addEventListener("click", async () => {
      const name = prompt("Name der neuen Sammlung:", "Neue Sammlung");
      if (name) await createCollection(name);
    });
    $("#openWishlistButton")?.addEventListener("click", openWishlist);
    $("#renameCollectionButton")?.addEventListener("click", renameActiveCollection);
    $("#deleteCollectionButton")?.addEventListener("click", deleteActiveCollection);
    $("#exportCollectionButton")?.addEventListener("click", exportBackup);
    $("#importCollectionButton")?.addEventListener("click", () => $("#importCollectionInput")?.click());
    $("#importCollectionInput")?.addEventListener("change", async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importBackup(file);
      } catch (error) {
        toast(error.message || "Import fehlgeschlagen.", true);
      }
      event.target.value = "";
    });

    $("#collectionSearchInput")?.addEventListener("input", event => {
      collectionViewState.query = String(event.target.value || "").slice(0, 120);
      saveCollectionViewState();
      clearTimeout(collectionSearchTimer);
      collectionSearchTimer = setTimeout(() => void renderCollection({ skipRepair: true }), 120);
    });
    $("#clearCollectionSearchButton")?.addEventListener("click", () => {
      collectionViewState.query = "";
      saveCollectionViewState();
      void renderCollection({ skipRepair: true });
      $("#collectionSearchInput")?.focus();
    });
    $("#collectionFilterSelect")?.addEventListener("change", event => {
      collectionViewState.filter = COLLECTION_FILTER_VALUES.has(event.target.value) ? event.target.value : "all";
      saveCollectionViewState();
      void renderCollection({ skipRepair: true });
    });
    $("#collectionLanguageFilter")?.addEventListener("change", event => {
      collectionViewState.language = event.target.value || "all";
      saveCollectionViewState();
      void renderCollection({ skipRepair: true });
    });
    $("#collectionSortSelect")?.addEventListener("change", event => {
      collectionViewState.sort = COLLECTION_SORT_VALUES.has(event.target.value) ? event.target.value : "name-asc";
      saveCollectionViewState();
      void renderCollection({ skipRepair: true });
    });
    document.querySelectorAll("[data-collection-filter]").forEach(button => {
      button.addEventListener("click", () => {
        collectionViewState.filter = COLLECTION_FILTER_VALUES.has(button.dataset.collectionFilter) ? button.dataset.collectionFilter : "all";
        saveCollectionViewState();
        void renderCollection({ skipRepair: true });
      });
    });
    $("#resetCollectionFiltersButton")?.addEventListener("click", resetCollectionOrganizer);

    $("#collectionDetailBackdrop")?.addEventListener("click", closeDetailSheet);
    $("#closeCollectionDetailButton")?.addEventListener("click", closeDetailSheet);
    $("#cancelCollectionDetailButton")?.addEventListener("click", closeDetailSheet);
    $("#saveCollectionDetailButton")?.addEventListener("click", saveActiveDetail);
    $("#deleteCollectionEntryButton")?.addEventListener("click", deleteActiveDetail);
    $("#retryCardImageButton")?.addEventListener("click", retryActiveDetailImage);
    $("#detailQuantityMinus")?.addEventListener("click", () => changeDetailQuantity(-1));
    $("#detailQuantityPlus")?.addEventListener("click", () => changeDetailQuantity(1));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && activeDetailEntryId) closeDetailSheet();
    });
  }

  function changeDetailQuantity(change) {
    const input = $("#detailQuantity");
    if (!input) return;
    const next = Math.max(1, Math.round(Number(input.value || 1) + change));
    input.value = String(next);
  }

  async function migrateLegacyCardmarketLinks() {
    try {
      if (localStorage.getItem(CARDMARKET_LINK_MIGRATION_KEY) === "done") return;
      const db = await openDatabase();
      const tx = db.transaction("cards", "readwrite");
      const store = tx.objectStore("cards");
      const cards = await requestToPromise(store.getAll());
      const now = new Date().toISOString();

      for (const card of cards) {
        const directUrl = normalizeCardmarketUrl(card.cardmarketUrl || card.pricing?.cardmarket?.url || "");
        const pricing = sanitizePricing(card.pricing);
        const oldUrl = String(card.cardmarketUrl || "");
        const oldPricingUrl = String(card.pricing?.cardmarket?.url || "");
        const newPricingUrl = String(pricing?.cardmarket?.url || "");
        if (oldUrl !== directUrl || oldPricingUrl !== newPricingUrl) {
          store.put({
            ...card,
            cardmarketUrl: directUrl,
            pricing,
            cardmarketCheckedAt: "",
            updatedAt: now
          });
        }
      }

      await transactionDone(tx);
      localStorage.setItem(CARDMARKET_LINK_MIGRATION_KEY, "done");
    } catch (error) {
      console.warn("Alte Cardmarket-Weiterleitungen konnten nicht vollständig bereinigt werden:", error);
    }
  }

  async function init() {
    try {
      await requestPersistentStorage();
      await ensureDefaultCollection();
      await ensureWishlistCollection();
      await migrateLegacyCardmarketLinks();
      wireUi();
      await refreshAll();
    } catch (error) {
      console.error("Sammlungsdatenbank konnte nicht initialisiert werden:", error);
      toast("Lokale Sammlungsdatenbank ist nicht verfügbar.", true);
    }
  }

  function normalizePriority(value) {
    return ["high", "medium", "low"].includes(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "medium";
  }

  function priorityLabel(value) {
    return ({ high: "Hohe", medium: "Mittlere", low: "Niedrige" })[normalizePriority(value)];
  }

  async function openWishlist() {
    activeCollectionId = WISHLIST_COLLECTION_ID;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    await refreshAll();
    switchView("collection");
  }

  async function addToWishlist(card, options = {}) {
    return addCard(card, { ...options, collectionId: WISHLIST_COLLECTION_ID });
  }


  async function addCardsToWishlist(cards, options = {}) {
    const input = Array.isArray(cards) ? cards.filter(Boolean) : [];
    if (!input.length) return { added: 0, skipped: 0 };

    const existingEntries = await getEntries(WISHLIST_COLLECTION_ID);
    const existingIds = new Set(existingEntries.map(entry => entry.id));
    const collection = await getCollection(WISHLIST_COLLECTION_ID);
    const db = await openDatabase();
    const tx = db.transaction(["cards", "entries", "collections"], "readwrite");
    const done = transactionDone(tx);
    const cardStore = tx.objectStore("cards");
    const entryStore = tx.objectStore("entries");
    const now = new Date().toISOString();
    const seen = new Set();
    let added = 0;
    let skipped = 0;

    for (const card of input) {
      const normalized = normalizeCard(card);
      if (!normalized.id || seen.has(normalized.id)) {
        skipped += 1;
        continue;
      }
      seen.add(normalized.id);
      const language = options.language || card._dataLanguage || card.dataLanguage || "de";
      const variant = options.variant || inferDefaultVariant(card);
      const entryId = buildEntryId(WISHLIST_COLLECTION_ID, normalized.id, language, variant);
      if (existingIds.has(entryId)) {
        skipped += 1;
        continue;
      }

      cardStore.put(normalized);
      entryStore.put({
        id: entryId,
        collectionId: WISHLIST_COLLECTION_ID,
        cardId: normalized.id,
        quantity: Math.max(1, Math.round(Number(options.quantity || 1))),
        language,
        variant,
        condition: "NM",
        purchasePrice: null,
        purchaseDate: "",
        notes: "",
        priority: normalizePriority(options.priority || "medium"),
        targetPrice: parseLocalizedNumber(options.targetPrice) ?? null,
        createdAt: now,
        updatedAt: now,
        syncStatus: "local"
      });
      existingIds.add(entryId);
      added += 1;
    }

    if (collection && added) tx.objectStore("collections").put({ ...collection, updatedAt: now });
    await done;
    if (added) await refreshAll();
    toast(added
      ? `${added} ${added === 1 ? "Karte wurde" : "Karten wurden"} zur Wunschliste hinzugefügt.`
      : "Alle ausgewählten Karten stehen bereits auf der Wunschliste.");
    return { added, skipped };
  }

  function buildEntryId(collectionId, cardId, language, variant) {
    return `${collectionId}::${cardId}::${language || "de"}::${variant || "normal"}`;
  }

  function normalizeImageBase(value) {
    return String(value || "").replace(/\/(?:low|high)\.(?:webp|png|jpe?g)$/i, "").replace(/\/$/, "");
  }

  function getCardImageUrl(value, quality = "low") {
    const base = normalizeImageBase(value);
    if (!/^https?:\/\//i.test(base)) return "";
    return `${base}/${quality}.webp`;
  }

  function getStoredCardImageUrl(card, quality = "low") {
    if (card?.scanImage && String(card.scanImage).startsWith("data:image/")) return card.scanImage;
    if ((card?.directImage || isDirectImageUrl(card?.image)) && /^https?:\/\//i.test(String(card.image || ""))) return card.image;
    return getCardImageUrl(card?.image, quality) || "icons/card-placeholder.svg";
  }

  function variantLabel(value) {
    return VARIANT_OPTIONS.find(([key]) => key === value)?.[1] || "Normal";
  }

  function normalizeOptionValue(value, options, fallback) {
    const clean = String(value || "");
    return options.some(([key]) => key === clean) ? clean : fallback;
  }

  function parseLocalizedNumber(value) {
    const clean = String(value ?? "").trim();
    if (!clean) return null;
    const normalized = clean.replace(/\s/g, "").replace(",", ".");
    const number = Number(normalized);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
  }

  function hasStoredNumber(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function firstFinite(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function formatEuro(value) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value));
  }

  function setSelectValue(select, value) {
    if (!select) return;
    select.value = value;
    if (!select.value && select.options.length) select.selectedIndex = 0;
  }

  function isFresh(value) {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) && Date.now() - timestamp < CARD_DATA_MAX_AGE;
  }

  function unique(values) {
    return [...new Set(values)];
  }

  async function mapWithConcurrency(items, concurrency, mapper) {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), queue.length || 1) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        await mapper(item);
      }
    });
    await Promise.all(workers);
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  window.CardDexCollections = {
    init,
    addCard,
    addToWishlist,
    addCardsToWishlist,
    openWishlist,
    getWishlistId: () => WISHLIST_COLLECTION_ID,
    refresh: refreshAll,
    getActiveCollectionId: () => activeCollectionId,
    getCollections,
    getEntries,
    getEntry,
    setQuantity,
    updateEntryDetails,
    deleteEntry,
    removeWishlistEntries,
    populateSelect: renderCollectionSelectors,
    switchView,
    openEntryDetail,
    suggestVariant: inferDefaultVariant,
    escapeHtml
  };
})();
