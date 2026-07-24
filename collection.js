"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 1;
  const API_BASE = "https://api.tcgdex.net/v2";
  const POKEMON_TCG_API = "https://api.pokemontcg.io/v2";
  const DEFAULT_COLLECTION_ID = "default-collection";
  const ACTIVE_COLLECTION_KEY = "carddex-v67-active-collection";
  const BACKUP_VERSION = 2;
  const CARD_DATA_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

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
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB konnte nicht geöffnet werden"));
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

  async function getCollections() {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readonly");
    const done = transactionDone(tx);
    const result = await requestToPromise(tx.objectStore("collections").getAll());
    await done;
    return result.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name, "de"));
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
      pricing: card.pricing || null,
      cardmarketUrl: normalizeCardmarketUrl(card.cardmarketUrl || card.pricing?.cardmarket?.url || ""),
      englishName: card.englishName || "",
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
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      syncStatus: "local"
    });
    const collectionStore = tx.objectStore("collections");
    if (collection) collectionStore.put({ ...collection, updatedAt: now });
    await done;
    await refreshAll();
    toast(`${normalized.name} wurde ${existing ? "erneut " : ""}zur Sammlung hinzugefügt.`);
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
    else store.put({ ...entry, quantity: Math.max(1, Math.round(Number(quantity) || 1)), updatedAt: new Date().toISOString(), syncStatus: "local" });
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
    const nextEntryId = buildEntryId(current.collectionId, current.cardId, language, variant);
    const now = new Date().toISOString();

    const [collision, collectionRecord] = await Promise.all([
      nextEntryId !== entryId ? getRawEntry(nextEntryId) : Promise.resolve(null),
      getCollection(current.collectionId)
    ]);
    const { card: _card, collection: _collection, ...currentRaw } = current;
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
      quantity: collision ? Number(collision.quantity || 0) + quantity : quantity,
      language,
      variant,
      condition,
      purchasePrice,
      purchaseDate,
      notes,
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
    if (askForConfirmation && !confirm(`„${current.card?.name || "Diese Karte"}“ vollständig aus der Sammlung entfernen?`)) return false;
    const db = await openDatabase();
    const tx = db.transaction("entries", "readwrite");
    const done = transactionDone(tx);
    tx.objectStore("entries").delete(entryId);
    await done;
    await refreshAll();
    toast("Karte wurde aus der Sammlung entfernt.");
    return true;
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
    if (activeCollectionId === DEFAULT_COLLECTION_ID) {
      toast("Die Standardsammlung kann nicht gelöscht werden.", true);
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
    const tx = db.transaction(["collections", "cards", "entries"], "readonly");
    const done = transactionDone(tx);
    const [collections, cards, entries] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("cards").getAll()),
      requestToPromise(tx.objectStore("entries").getAll())
    ]);
    await done;
    const backup = {
      app: "CardDex AI",
      appVersion: "6.8",
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      activeCollectionId,
      collections,
      cards,
      entries
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
    const tx = db.transaction(["collections", "cards", "entries"], "readwrite");
    const done = transactionDone(tx);
    for (const name of ["collections", "cards", "entries"]) tx.objectStore(name).clear();
    backup.collections.forEach(item => tx.objectStore("collections").put(item));
    (backup.cards || []).forEach(item => tx.objectStore("cards").put(normalizeCard(item)));
    backup.entries.forEach(item => tx.objectStore("entries").put({
      condition: "NM",
      variant: "normal",
      language: "de",
      purchasePrice: null,
      purchaseDate: "",
      notes: "",
      ...item
    }));
    await done;
    activeCollectionId = backup.activeCollectionId || DEFAULT_COLLECTION_ID;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    await ensureDefaultCollection();
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
      const chosen = select.value || activeCollectionId;
      select.innerHTML = "";
      collections.forEach(collection => {
        const option = document.createElement("option");
        option.value = collection.id;
        option.textContent = collection.name;
        select.append(option);
      });
      select.value = collections.some(item => item.id === chosen) ? chosen : activeCollectionId;
    });
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
    const total = entries.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    $("#collectionTitle").textContent = current.name;
    $("#collectionTotalCount").textContent = String(total);
    $("#collectionUniqueCount").textContent = String(entries.length);
    $("#activeCollectionSelect").value = activeCollectionId;
    $("#deleteCollectionButton").disabled = current.isDefault;
    container.innerHTML = "";

    if (!entries.length) {
      container.innerHTML = `<div class="collection-empty"><strong>NOCH KEINE KARTEN REGISTRIERT</strong><p>Scanne oder suche eine Karte und füge sie dieser Sammlung hinzu.</p></div>`;
      return;
    }

    entries.forEach(entry => container.append(createCollectionCard(entry)));
    if (!options.skipRepair) void repairMissingCardData(entries, renderToken);
  }

  function createCollectionCard(entry) {
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
    [String(entry.language || "de").toUpperCase(), variantLabel(entry.variant), entry.condition || "NM"].forEach(value => {
      const tag = document.createElement("span");
      tag.textContent = value;
      tags.append(tag);
    });
    info.append(title, meta, tags);
    openButton.append(image, info);
    openButton.addEventListener("click", () => openEntryDetail(entry.id));

    const quantityControl = createQuantityControl(entry);
    article.append(openButton, quantityControl);
    return article;
  }

  function createQuantityControl(entry) {
    const control = document.createElement("div");
    control.className = "quantity-control";
    control.setAttribute("aria-label", "Anzahl");
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
    if (!card.image || isStale || !card.rarity || !card.illustrator) {
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
    if (collectionName) collectionName.textContent = entry.collection?.name || "Sammlung";

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
      const imageUrl = getCardImageUrl(updated?.image, "high");
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
    const direct = normalizeCardmarketUrl(card.cardmarketUrl || card.pricing?.cardmarket?.url || "");
    if (direct) {
      link.href = direct;
      return;
    }
    const compactIdentifier = [String(card.setId || "").toUpperCase(), String(card.localId || "")].filter(Boolean).join("");
    const query = [card.englishName || card.name, compactIdentifier || card.localId].filter(Boolean).join(" ");
    link.href = `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(query)}`;
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
    if (!forceRefresh && existing?.image && isFresh(existing.detailsFetchedAt)) return existing;
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
      if (pokemonFallback?.englishName) merged.englishName = pokemonFallback.englishName;
      if (pokemonFallback?.pricing) merged.pricing = mergePricing(merged.pricing, pokemonFallback.pricing);
      await putCard(merged);
      return merged;
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
    const cleanNumber = number.replace(/["\:]/g, " ");
    const cleanName = englishName.replace(/["\:]/g, " ");
    const q = englishName ? `number:${cleanNumber} name:${cleanName}*` : `number:${cleanNumber}`;
    let params = new URLSearchParams({ q, pageSize: "20" });
    let response = await fetch(`${POKEMON_TCG_API}/cards?${params.toString()}`, { cache: "no-store" });
    let payload = response.ok ? await response.json() : null;
    let cards = Array.isArray(payload?.data) ? payload.data : [];
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
    return {
      id: existing?.id || `ptcg-${best.id}`,
      name: existing?.name || best.name,
      englishName: best.name || englishName,
      localId: String(best.number || number),
      image: best.images?.large || best.images?.small || "",
      _directImage: true,
      cardmarketUrl: normalizeCardmarketUrl(best.cardmarket?.url),
      pricing: best.cardmarket?.prices ? { cardmarket: {
        url: normalizeCardmarketUrl(best.cardmarket?.url),
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
    const setText = normalizeComparableText(`${card.set?.id || ""} ${card.set?.name || ""}`);
    const existingSet = normalizeComparableText(`${existing?.setId || ""} ${existing?.setName || ""}`);
    if (existingSet && setText && (setText.includes(existingSet) || existingSet.includes(setText))) score += 80;
    return score;
  }

  function normalizeComparableText(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function normalizeCardmarketUrl(value) {
    const url = String(value || "").trim();
    return /^https:\/\/(?:www\.)?cardmarket\.com\/(?:de|en)\/Pokemon\/Products\/Singles\//i.test(url) ? url : "";
  }

  function mergePricing(current, fallback) {
    if (!current) return fallback || null;
    if (!fallback) return current;
    return { ...fallback, ...current, cardmarket: { ...(fallback.cardmarket || {}), ...(current.cardmarket || {}) } };
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
      image: normalizeImageBase(imageSource?.image || primary?.image || existing?.image || ""),
      directImage: Boolean(imageSource?._directImage || imageSource?.directImage || existing?.directImage),
      imageLanguage: imageLanguage || primaryLanguage || existing?.imageLanguage || "",
      rarity: primary?.rarity || existing?.rarity || "",
      category: primary?.category || existing?.category || "",
      illustrator: primary?.illustrator || existing?.illustrator || "",
      hp: primary?.hp ?? existing?.hp ?? null,
      types: Array.isArray(primary?.types) ? primary.types : (existing?.types || []),
      variants: primary?.variants || existing?.variants || null,
      pricing: primary?.pricing || existing?.pricing || null,
      detailsFetchedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async function refreshAll() {
    await renderCollectionSelectors();
    await renderCollection();
  }

  function switchView(view) {
    const scannerView = $("#scannerView");
    const collectionView = $("#collectionView");
    const scannerButton = $("#showScannerView");
    const collectionButton = $("#showCollectionView");
    const showCollection = view === "collection";
    scannerView?.classList.toggle("hidden", showCollection);
    collectionView?.classList.toggle("hidden", !showCollection);
    scannerButton?.classList.toggle("active", !showCollection);
    collectionButton?.classList.toggle("active", showCollection);
    scannerButton?.setAttribute("aria-selected", String(!showCollection));
    collectionButton?.setAttribute("aria-selected", String(showCollection));
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

    $("#showScannerView")?.addEventListener("click", () => switchView("scanner"));
    $("#showCollectionView")?.addEventListener("click", () => switchView("collection"));
    $("#activeCollectionSelect")?.addEventListener("change", async event => {
      activeCollectionId = event.target.value;
      localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
      await refreshAll();
    });
    $("#createCollectionButton")?.addEventListener("click", async () => {
      const name = prompt("Name der neuen Sammlung:", "Neue Sammlung");
      if (name) await createCollection(name);
    });
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

  async function init() {
    try {
      await requestPersistentStorage();
      await ensureDefaultCollection();
      wireUi();
      await refreshAll();
    } catch (error) {
      console.error("Sammlungsdatenbank konnte nicht initialisiert werden:", error);
      toast("Lokale Sammlungsdatenbank ist nicht verfügbar.", true);
    }
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
    if (card?.directImage && /^https?:\/\//i.test(String(card.image || ""))) return card.image;
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
    refresh: refreshAll,
    getActiveCollectionId: () => activeCollectionId,
    populateSelect: renderCollectionSelectors,
    switchView,
    openEntryDetail,
    suggestVariant: inferDefaultVariant,
    escapeHtml
  };
})();
