"use strict";

(() => {
  const DB_NAME = "carddex-ai";
  const DB_VERSION = 1;
  const DEFAULT_COLLECTION_ID = "default-collection";
  const ACTIVE_COLLECTION_KEY = "carddex-v67-active-collection";
  const BACKUP_VERSION = 1;

  let dbPromise = null;
  let activeCollectionId = localStorage.getItem(ACTIVE_COLLECTION_KEY) || DEFAULT_COLLECTION_ID;
  let lastToastTimer = null;

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

  async function ensureDefaultCollection() {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readwrite");
    const store = tx.objectStore("collections");
    const existing = await requestToPromise(store.get(DEFAULT_COLLECTION_ID));
    if (!existing) {
      store.put({
        id: DEFAULT_COLLECTION_ID,
        name: "Meine Sammlung",
        type: "collection",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDefault: true
      });
    }
    await transactionDone(tx);
    const collections = await getCollections();
    if (!collections.some(item => item.id === activeCollectionId)) {
      activeCollectionId = collections[0]?.id || DEFAULT_COLLECTION_ID;
      localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    }
  }

  async function getCollections() {
    const db = await openDatabase();
    const tx = db.transaction("collections", "readonly");
    const result = await requestToPromise(tx.objectStore("collections").getAll());
    await transactionDone(tx);
    return result.sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name, "de"));
  }

  async function getEntries(collectionId = activeCollectionId) {
    const db = await openDatabase();
    const tx = db.transaction(["entries", "cards"], "readonly");
    const entries = await requestToPromise(tx.objectStore("entries").index("collectionId").getAll(collectionId));
    const cardStore = tx.objectStore("cards");
    const hydrated = await Promise.all(entries.map(async entry => ({ ...entry, card: await requestToPromise(cardStore.get(entry.cardId)) })));
    await transactionDone(tx);
    return hydrated.sort((a, b) => String(a.card?.name || "").localeCompare(String(b.card?.name || ""), "de"));
  }

  function normalizeCard(card) {
    const sourceId = String(card.id || `${card.set?.id || card._setBrief?.id || "set"}-${card.localId || "unknown"}`);
    return {
      id: sourceId,
      source: "tcgdex",
      name: card.name || "Unbekannte Karte",
      localId: String(card.localId || ""),
      setId: card.set?.id || card._setBrief?.id || "",
      setName: card.set?.name || card._setBrief?.name || "Set nicht angegeben",
      officialTotal: card.set?.cardCount?.official || card._setBrief?.cardCount?.official || null,
      image: card.image || "",
      rarity: card.rarity || "",
      category: card.category || "",
      illustrator: card.illustrator || "",
      pricing: card.pricing || null,
      updatedAt: new Date().toISOString()
    };
  }

  async function addCard(card, options = {}) {
    const collectionId = options.collectionId || activeCollectionId;
    const normalized = normalizeCard(card);
    const language = options.language || "de";
    const variant = options.variant || "normal";
    const entryId = `${collectionId}::${normalized.id}::${language}::${variant}`;
    const db = await openDatabase();
    const tx = db.transaction(["cards", "entries", "collections"], "readwrite");
    tx.objectStore("cards").put(normalized);
    const entryStore = tx.objectStore("entries");
    const existing = await requestToPromise(entryStore.get(entryId));
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
    const collection = await requestToPromise(collectionStore.get(collectionId));
    if (collection) collectionStore.put({ ...collection, updatedAt: now });
    await transactionDone(tx);
    await refreshAll();
    toast(`${normalized.name} wurde ${existing ? "erneut" : ""} zur Sammlung hinzugefügt.`);
    return quantity;
  }

  async function setQuantity(entryId, quantity) {
    const db = await openDatabase();
    const tx = db.transaction("entries", "readwrite");
    const store = tx.objectStore("entries");
    const entry = await requestToPromise(store.get(entryId));
    if (!entry) return;
    if (quantity <= 0) store.delete(entryId);
    else store.put({ ...entry, quantity, updatedAt: new Date().toISOString(), syncStatus: "local" });
    await transactionDone(tx);
    await refreshAll();
  }

  async function createCollection(name, type = "collection") {
    const cleanName = String(name || "").trim();
    if (!cleanName) throw new Error("Bitte einen Namen eingeben.");
    const id = `collection-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const db = await openDatabase();
    const tx = db.transaction("collections", "readwrite");
    const now = new Date().toISOString();
    tx.objectStore("collections").put({ id, name: cleanName, type, createdAt: now, updatedAt: now, isDefault: false });
    await transactionDone(tx);
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
    tx.objectStore("collections").put({ ...current, name: nextName, updatedAt: new Date().toISOString() });
    await transactionDone(tx);
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
    const db = await openDatabase();
    const tx = db.transaction(["collections", "entries"], "readwrite");
    tx.objectStore("collections").delete(activeCollectionId);
    const index = tx.objectStore("entries").index("collectionId");
    const keys = await requestToPromise(index.getAllKeys(activeCollectionId));
    keys.forEach(key => tx.objectStore("entries").delete(key));
    await transactionDone(tx);
    activeCollectionId = DEFAULT_COLLECTION_ID;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    await refreshAll();
  }

  async function exportBackup() {
    const db = await openDatabase();
    const tx = db.transaction(["collections", "cards", "entries"], "readonly");
    const [collections, cards, entries] = await Promise.all([
      requestToPromise(tx.objectStore("collections").getAll()),
      requestToPromise(tx.objectStore("cards").getAll()),
      requestToPromise(tx.objectStore("entries").getAll())
    ]);
    await transactionDone(tx);
    const backup = {
      app: "CardDex AI",
      appVersion: "6.7",
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
    for (const name of ["collections", "cards", "entries"]) tx.objectStore(name).clear();
    backup.collections.forEach(item => tx.objectStore("collections").put(item));
    (backup.cards || []).forEach(item => tx.objectStore("cards").put(item));
    backup.entries.forEach(item => tx.objectStore("entries").put(item));
    await transactionDone(tx);
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
    lastToastTimer = setTimeout(() => element.classList.remove("show"), 2600);
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

  async function renderCollection() {
    const container = $("#collectionCards");
    if (!container) return;
    const collections = await getCollections();
    const current = collections.find(item => item.id === activeCollectionId) || collections[0];
    if (!current) return;
    activeCollectionId = current.id;
    localStorage.setItem(ACTIVE_COLLECTION_KEY, activeCollectionId);
    const entries = await getEntries(activeCollectionId);
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

    entries.forEach(entry => {
      const card = entry.card || {};
      const article = document.createElement("article");
      article.className = "collection-card";
      const imageUrl = card.image ? `${card.image}/low.webp` : "icons/card-placeholder.svg";
      article.innerHTML = `
        <img loading="lazy" src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(card.name || "Pokémon-Karte")}">
        <div class="collection-card-info">
          <h3>${escapeHtml(card.name || "Unbekannte Karte")}</h3>
          <p>${escapeHtml(card.setName || "Set nicht angegeben")} · Nr. ${escapeHtml(card.localId || "–")}</p>
          <div class="collection-card-tags"><span>${escapeHtml(entry.language?.toUpperCase() || "DE")}</span><span>${escapeHtml(entry.condition || "NM")}</span></div>
        </div>
        <div class="quantity-control" aria-label="Anzahl">
          <button type="button" data-action="minus" aria-label="Anzahl verringern">−</button>
          <strong>${Number(entry.quantity || 1)}</strong>
          <button type="button" data-action="plus" aria-label="Anzahl erhöhen">+</button>
        </div>`;
      article.querySelector('[data-action="minus"]').addEventListener("click", () => setQuantity(entry.id, Number(entry.quantity || 1) - 1));
      article.querySelector('[data-action="plus"]').addEventListener("click", () => setQuantity(entry.id, Number(entry.quantity || 1) + 1));
      article.querySelector("img").addEventListener("error", event => { event.currentTarget.src = "icons/card-placeholder.svg"; }, { once: true });
      container.append(article);
    });
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

  function wireUi() {
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
      try { await importBackup(file); } catch (error) { toast(error.message || "Import fehlgeschlagen.", true); }
      event.target.value = "";
    });
  }

  async function init() {
    try {
      await ensureDefaultCollection();
      wireUi();
      await refreshAll();
    } catch (error) {
      console.error("Sammlungsdatenbank konnte nicht initialisiert werden:", error);
      toast("Lokale Sammlungsdatenbank ist nicht verfügbar.", true);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) { return escapeHtml(value); }

  window.CardDexCollections = {
    init,
    addCard,
    refresh: refreshAll,
    getActiveCollectionId: () => activeCollectionId,
    populateSelect: renderCollectionSelectors,
    switchView
  };
})();
