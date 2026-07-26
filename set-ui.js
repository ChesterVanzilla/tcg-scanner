"use strict";

(() => {
  let initialized = false;
  let overviewMode = "owned";
  let overviewFilter = "all";
  let overviewSort = "progress-desc";
  let overviewSearch = "";
  let selectedSetId = "";
  let detailFilter = "all";
  let detailSearch = "";
  let overviewToken = 0;
  let detailToken = 0;
  let currentDetail = null;
  let visibleDetailCards = [];
  let selectionMode = false;
  const selectedCardKeys = new Set();
  const expandedDuplicateKeys = new Set();
  const detailScrollPositions = new Map();
  let overviewScrollTop = 0;
  let lastOpenedOverviewSetId = "";
  let scrollUpdateScheduled = false;
  let suppressScrollTracking = false;
  let jumpMenuOpen = false;

  const $ = selector => document.querySelector(selector);

  function escapeHtml(value) {
    return window.CardDexCore?.escapeHtml?.(value) || String(value ?? "");
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function formatCount(value) {
    return new Intl.NumberFormat("de-DE").format(Math.max(0, Number(value || 0)));
  }

  function goalLabel(value) {
    return ({
      numbers: "Jede Kartennummer einmal",
      "normal-reverse": "Normal/Holo + Reverse",
      master: "Alle bekannten Varianten"
    })[String(value || "numbers")] || "Jede Kartennummer einmal";
  }

  function goalHint(value) {
    if (value === "normal-reverse") return "Reverse-Karten zählen zusätzlich zur normalen oder Holo-Version.";
    if (value === "master") return "Jede von der Datenbank bekannte Kartenvariante zählt als eigenes Sammelziel.";
    return "Fortschritt wird nach jeder Kartennummer berechnet.";
  }

  function variantLabel(value) {
    return ({ normal: "Normal", holo: "Holo", reverse: "Reverse Holo", firstEdition: "1. Auflage", wPromo: "Promo", other: "Sonstige" })[String(value || "normal")] || "Normal";
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = String(value ?? "0");
  }

  function imageUrl(value, quality = "low") {
    const url = String(value || "").trim();
    if (!url) return "icons/card-placeholder.svg";
    if (/\.(?:webp|png|jpe?g|avif)(?:[?#].*)?$/i.test(url)) return url;
    return `${url.replace(/\/$/, "")}/${quality}.webp`;
  }

  function setAssetSources(set) {
    return [set?.logo, set?.fallbackLogo, set?.symbol, set?.fallbackSymbol, "icons/card-placeholder.svg"]
      .map(value => String(value || "").trim())
      .filter((value, index, array) => value && array.indexOf(value) === index);
  }

  function applyImageFallback(image, sources) {
    const queue = [...sources];
    const loadNext = () => {
      const next = queue.shift();
      if (!next) return;
      image.src = next;
    };
    image.onerror = loadNext;
    loadNext();
  }

  function createEmpty(title, text) {
    const box = document.createElement("div");
    box.className = "set-empty-state";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    box.append(strong, paragraph);
    return box;
  }

  function createLoading(text) {
    const box = document.createElement("div");
    box.className = "set-loading-state";
    box.innerHTML = `<span class="set-loading-led" aria-hidden="true"></span><strong>${escapeHtml(text)}</strong>`;
    return box;
  }

  function setOverviewPanels(showDetail) {
    $("#setOverviewPanel")?.classList.toggle("hidden", showDetail);
    $("#setDetailPanel")?.classList.toggle("hidden", !showDetail);
  }

  function isSetsViewActive() {
    const view = $("#setsView");
    return Boolean(view && !view.classList.contains("hidden") && window.CardDexLibrary?.getActiveView?.() === "sets");
  }

  function currentScrollPosition() {
    return Math.max(0, Number(window.scrollY || document.documentElement.scrollTop || 0));
  }

  function rememberScrollPosition() {
    if (suppressScrollTracking || !isSetsViewActive()) return;
    const top = currentScrollPosition();
    if (selectedSetId) detailScrollPositions.set(selectedSetId, top);
    else overviewScrollTop = top;
  }

  function getSavedScrollPosition() {
    return selectedSetId ? Number(detailScrollPositions.get(selectedSetId) || 0) : Number(overviewScrollTop || 0);
  }

  function restoreScrollPosition(target = getSavedScrollPosition(), behavior = "auto") {
    const top = Math.max(0, Number(target || 0));
    suppressScrollTracking = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo({ top, behavior });
      updateFloatingNavigation();
      window.setTimeout(() => {
        suppressScrollTracking = false;
        rememberScrollPosition();
        updateFloatingNavigation();
      }, behavior === "smooth" ? 420 : 80);
    }));
  }

  function restoreElementPosition(element, block = "start") {
    if (!element) return;
    suppressScrollTracking = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: "auto", block, inline: "nearest" });
      updateFloatingNavigation();
      window.setTimeout(() => {
        suppressScrollTracking = false;
        rememberScrollPosition();
        updateFloatingNavigation();
      }, 100);
    }));
  }

  function panelTop(element) {
    if (!element) return 0;
    const rect = element.getBoundingClientRect();
    const stickyOffset = selectedSetId && element.id !== "setDetailPanel"
      ? Number($("#setDetailPanel .set-detail-topbar")?.offsetHeight || 0) + 16
      : 8;
    return Math.max(0, currentScrollPosition() + rect.top - stickyOffset);
  }

  function closeJumpMenu() {
    jumpMenuOpen = false;
    $("#setJumpMenuBackdrop")?.classList.add("hidden");
    $("#openSetJumpMenuButton")?.setAttribute("aria-expanded", "false");
    document.documentElement.classList.remove("set-jump-open");
  }

  function jumpToTarget(target) {
    closeJumpMenu();
    if (target === "end") {
      window.scrollTo({ top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight), behavior: "smooth" });
      return;
    }
    const element = typeof target === "string" ? $(target) : target;
    if (!element) return;
    window.scrollTo({ top: panelTop(element), behavior: "smooth" });
  }

  function getJumpActions() {
    if (selectedSetId) {
      return [
        { label: "Set-Kopf", hint: "Fortschritt und Sammelziel", target: "#setDetailPanel" },
        { label: "Filter & Suche", hint: "Kartenansicht wechseln", target: ".set-detail-browser" },
        { label: "Reguläre Karten", hint: "Zum Beginn der Kartenliste", target: "#setRegularCardsAnchor" },
        { label: "Secret Rares", hint: "Zum ersten Secret-Rare-Eintrag", target: "#setSecretCardsAnchor" },
        { label: "Listenende", hint: "Zur letzten angezeigten Karte", target: "end" }
      ];
    }
    return [
      { label: "Set-Übersicht", hint: "Statistik und SetDex-Kopf", target: "#setOverviewPanel" },
      { label: "Filter & Suche", hint: "Sets durchsuchen und sortieren", target: ".set-browser" },
      { label: "Setliste", hint: "Zum ersten Set", target: "#setOverviewGrid" },
      { label: "Listenende", hint: "Zum Ende der Setliste", target: "end" }
    ];
  }

  function openJumpMenu() {
    const container = $("#setJumpMenuActions");
    const backdrop = $("#setJumpMenuBackdrop");
    if (!container || !backdrop) return;
    container.innerHTML = "";
    getJumpActions().forEach(action => {
      if (action.target !== "end" && !$(action.target)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.innerHTML = `<strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(action.hint)}</span>`;
      button.addEventListener("click", () => jumpToTarget(action.target));
      container.append(button);
    });
    jumpMenuOpen = true;
    backdrop.classList.remove("hidden");
    $("#openSetJumpMenuButton")?.setAttribute("aria-expanded", "true");
    document.documentElement.classList.add("set-jump-open");
  }

  function updateFloatingNavigation() {
    const navigation = $("#setFloatingNavigation");
    if (!navigation) return;
    const threshold = Math.max(380, window.innerHeight * 0.72);
    navigation.classList.toggle("hidden", !isSetsViewActive() || currentScrollPosition() < threshold);
    if (!isSetsViewActive() && jumpMenuOpen) closeJumpMenu();
  }

  function scheduleScrollUpdate() {
    if (scrollUpdateScheduled) return;
    scrollUpdateScheduled = true;
    requestAnimationFrame(() => {
      scrollUpdateScheduled = false;
      if (!suppressScrollTracking) rememberScrollPosition();
      updateFloatingNavigation();
    });
  }

  function updateOverviewChipState() {
    document.querySelectorAll("[data-set-overview-filter]").forEach(button => {
      button.classList.toggle("active", button.dataset.setOverviewFilter === overviewFilter);
    });
  }

  function updateDetailChipState() {
    document.querySelectorAll("[data-set-detail-filter]").forEach(button => {
      button.classList.toggle("active", button.dataset.setDetailFilter === detailFilter);
    });
  }

  function matchesOverviewFilter(set) {
    if (overviewFilter === "incomplete") return set.ownedUnique > 0 && !set.displayComplete;
    if (overviewFilter === "complete") return set.displayComplete;
    if (overviewFilter === "duplicates") return set.duplicateCopies > 0;
    if (overviewFilter === "wishlist") return set.wishlistCount > 0;
    return true;
  }

  function projectLabel(isProject) {
    return isProject ? "★ SET-PROJEKT" : "☆ PROJEKT";
  }

  async function toggleProject(setId, button = null) {
    const active = window.CardDexSetEngine?.toggleSetProject?.(setId);
    if (button) {
      button.classList.toggle("active", Boolean(active));
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.textContent = button.classList.contains("set-project-toggle")
        ? (active ? "★" : "☆")
        : projectLabel(active);
      if (button.classList.contains("set-project-toggle") && button.dataset.setName) {
        button.setAttribute("aria-label", active
          ? `${button.dataset.setName} nicht mehr als Set-Projekt führen`
          : `${button.dataset.setName} als Set-Projekt merken`);
      }
    }
    if (currentDetail?.set?.id === String(setId || "").toLowerCase()) {
      currentDetail.set.project = Boolean(active);
      updateProjectDetailButton(currentDetail.set);
    }
  }

  function updateProjectDetailButton(set) {
    const button = $("#setDetailProjectButton");
    if (!button) return;
    const active = Boolean(set?.project ?? window.CardDexSetEngine?.isSetProject?.(set?.id));
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.textContent = active ? "★ Set-Projekt" : "☆ Als Projekt merken";
  }

  function missingWishlistCandidates(result) {
    return (result?.cards || []).filter(card => !card.ownedQuantity && !card.unlisted && !card.wishlistQuantity);
  }

  function updateBulkWishlistAction(result) {
    const button = $("#addMissingSetToWishlistButton");
    const status = $("#setProjectActionStatus");
    if (!button || !status) return;
    const candidates = missingWishlistCandidates(result);
    button.disabled = !candidates.length;
    button.textContent = candidates.length
      ? `${formatCount(candidates.length)} fehlende ${candidates.length === 1 ? "Karte" : "Karten"} zur Wunschliste`
      : "Alle fehlenden Karten vorgemerkt";
    status.textContent = result?.set?.missing
      ? `${formatCount(result.set.missing)} Karten fehlen insgesamt. Bereits vorgemerkte Karten werden nicht doppelt angelegt.`
      : "Dieses Set ist vollständig – es gibt keine fehlenden Karten mehr.";
  }


  function getSelectedCards() {
    if (!currentDetail) return [];
    return currentDetail.cards.filter(card => selectedCardKeys.has(card.key));
  }

  function updateSelectionToolbar() {
    const toolbar = $("#setSelectionToolbar");
    const toggle = $("#toggleSetSelectionButton");
    toolbar?.classList.toggle("hidden", !selectionMode);
    toggle?.setAttribute("aria-pressed", selectionMode ? "true" : "false");
    toggle?.classList.toggle("active", selectionMode);
    if (toggle) toggle.textContent = selectionMode ? "Auswahl beenden" : "Auswahl";
    setText("#setSelectionCount", selectedCardKeys.size);

    const selected = getSelectedCards();
    const addButton = $("#addSelectedSetCardsToWishlistButton");
    const removeButton = $("#removeSelectedSetCardsFromWishlistButton");
    if (addButton) addButton.disabled = !selected.some(card => !card.ownedQuantity && !card.wishlistQuantity && !card.unlisted);
    if (removeButton) removeButton.disabled = !selected.some(card => card.wishlistEntries?.length);
  }

  function setSelectionMode(enabled) {
    selectionMode = Boolean(enabled);
    if (!selectionMode) selectedCardKeys.clear();
    updateSelectionToolbar();
    if (currentDetail) void renderDetailCardsOnly();
  }

  function toggleCardSelection(cardKey, selected) {
    if (selected) selectedCardKeys.add(cardKey);
    else selectedCardKeys.delete(cardKey);
    updateSelectionToolbar();
  }

  function sortOverviewSets(sets) {
    const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    return [...sets].sort((a, b) => {
      if (overviewSort === "name") return collator.compare(a.name, b.name);
      if (overviewSort === "missing-desc") return b.missing - a.missing || collator.compare(a.name, b.name);
      if (overviewSort === "duplicates-desc") return b.duplicateCopies - a.duplicateCopies || collator.compare(a.name, b.name);
      if (overviewSort === "cards-desc") return b.ownedUnique - a.ownedUnique || collator.compare(a.name, b.name);
      return Number(b.displayProgress ?? b.progress) - Number(a.displayProgress ?? a.progress) || b.ownedUnique - a.ownedUnique || collator.compare(a.name, b.name);
    });
  }

  function createSetCard(set) {
    const article = document.createElement("article");
    article.className = `set-overview-card${set.displayComplete ? " complete" : ""}${set.project ? " project" : ""}`;
    article.dataset.setId = set.id;
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `${set.name} öffnen`);

    const project = document.createElement("button");
    project.type = "button";
    project.className = `set-project-toggle${set.project ? " active" : ""}`;
    project.setAttribute("aria-pressed", set.project ? "true" : "false");
    project.dataset.setName = set.name;
    project.setAttribute("aria-label", set.project ? `${set.name} nicht mehr als Set-Projekt führen` : `${set.name} als Set-Projekt merken`);
    project.textContent = set.project ? "★" : "☆";
    project.addEventListener("click", event => {
      event.stopPropagation();
      void toggleProject(set.id, project);
    });

    const visual = document.createElement("span");
    visual.className = "set-overview-visual";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = `${set.name} Logo`;
    applyImageFallback(image, setAssetSources(set));
    visual.append(image);

    const body = document.createElement("span");
    body.className = "set-overview-body";
    const heading = document.createElement("span");
    heading.className = "set-overview-heading";
    const title = document.createElement("strong");
    title.textContent = set.name;
    const code = document.createElement("small");
    code.textContent = String(set.id || "").toUpperCase();
    heading.append(title, code);

    const stats = document.createElement("span");
    stats.className = "set-overview-card-stats";
    const displayOwned = Number(set.displayOwned ?? set.ownedUnique);
    const displayTotal = Number(set.displayTotal ?? set.total);
    const displayMissing = Number(set.displayMissing ?? set.missing);
    const displayComplete = Boolean(set.displayComplete);
    const totalLabel = displayTotal ? `${formatCount(displayOwned)} / ${formatCount(displayTotal)}` : `${formatCount(displayOwned)} gesammelt`;
    stats.innerHTML = `<b>${escapeHtml(totalLabel)}</b><small>${displayMissing ? `${formatCount(displayMissing)} fehlen` : displayComplete ? "SAMMELZIEL KOMPLETT" : "Gesamtzahl nicht verfügbar"}${set.duplicateCopies ? ` · ${formatCount(set.duplicateCopies)} doppelt` : ""}</small>`;

    const progress = document.createElement("span");
    progress.className = "set-progress-track";
    const fill = document.createElement("i");
    fill.style.width = `${Number(set.displayProgress ?? set.progress)}%`;
    progress.append(fill);

    const footer = document.createElement("span");
    footer.className = "set-overview-footer";
    const status = document.createElement("span");
    status.className = set.displayComplete ? "set-complete-badge" : "set-progress-badge";
    status.textContent = set.displayComplete ? "✓ VOLLSTÄNDIG" : `${Number(set.displayProgress ?? set.progress)} %`;
    const wishlist = document.createElement("span");
    wishlist.textContent = set.project
      ? `★ ${set.projectGoal === "master" ? "MASTER SET" : set.projectGoal === "normal-reverse" ? "NORMAL + REVERSE" : "SET-PROJEKT"}`
      : set.wishlistCount
        ? `★ ${formatCount(set.wishlistCount)} Wunschliste`
        : "Details öffnen";
    footer.append(status, wishlist);

    body.append(heading, stats, progress, footer);
    article.append(project, visual, body);
    article.addEventListener("click", () => openSet(set.id));
    article.addEventListener("keydown", event => {
      if (event.target.closest?.(".set-project-toggle")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSet(set.id);
    });
    return article;
  }

  async function renderOverview(options = {}) {
    const token = ++overviewToken;
    setOverviewPanels(false);
    const list = $("#setOverviewGrid");
    if (!list) return;
    list.innerHTML = "";
    list.append(createLoading(options.force ? "Set-Daten werden aktualisiert …" : "Set-Fortschritt wird berechnet …"));

    try {
      const result = await window.CardDexSetEngine.getSetOverview({
        includeAll: overviewMode === "all" || overviewMode === "projects",
        language: "de",
        force: Boolean(options.force)
      });
      if (token !== overviewToken) return;

      setText("#setStartedCount", result.stats.started);
      setText("#setCompleteCount", result.stats.complete);
      setText("#setMissingCount", result.stats.missing);
      setText("#setDuplicateCopiesCount", result.stats.duplicateCopies);

      const query = normalizeText(overviewSearch);
      let sets = result.sets.filter(set => {
        if (overviewMode === "all") return true;
        if (overviewMode === "projects") return set.project;
        return set.ownedUnique > 0;
      });
      sets = sets.filter(matchesOverviewFilter);
      if (query) {
        sets = sets.filter(set => normalizeText(`${set.name} ${set.id} ${set.serie?.name || ""}`).includes(query));
      }
      sets = sortOverviewSets(sets);

      const summary = $("#setOverviewSummary");
      if (summary) {
        const sourceText = result.stale ? " · Offline-Daten" : "";
        const projectText = overviewMode === "projects" && result.stats.projects ? ` · ${formatCount(result.stats.projects)} Projekte` : "";
        summary.textContent = `${formatCount(sets.length)} Sets angezeigt${projectText}${sourceText}`;
      }

      const status = $("#setOverviewStatus");
      if (status) {
        if (result.error && !result.catalogAvailable) {
          status.textContent = "Die Online-Setliste ist gerade nicht erreichbar. Bereits bekannte Sets aus deiner Sammlung bleiben verfügbar.";
          status.classList.add("warning");
        } else if (result.stale) {
          status.textContent = "Offline-Modus: Es werden zuletzt gespeicherte Set-Daten verwendet.";
          status.classList.add("warning");
        } else {
          status.textContent = overviewMode === "projects"
            ? `${formatCount(result.stats.projectMissing)} Karten fehlen noch in deinen Set-Projekten · ${formatCount(result.stats.projectWishlist)} davon stehen auf der Wunschliste.`
            : "Fortschritt basiert auf allen bekannten Karten eines Sets, einschließlich Secret Rares.";
          status.classList.remove("warning");
        }
      }

      list.innerHTML = "";
      if (!sets.length) {
        list.append(createEmpty(
          overviewMode === "owned" ? "NOCH KEIN SET GESTARTET" : overviewMode === "projects" ? "NOCH KEIN SET-PROJEKT" : "KEINE PASSENDEN SETS",
          overviewMode === "owned"
            ? "Sobald du eine Karte zu deiner Sammlung hinzufügst, erscheint das zugehörige Set hier automatisch."
            : overviewMode === "projects"
              ? "Markiere ein Set mit dem Stern, um es hier als persönliches Sammelprojekt zu verfolgen."
              : "Passe Suche oder Filter an."
        ));
        if (options.restoreScroll) restoreScrollPosition();
        else updateFloatingNavigation();
        return;
      }
      sets.forEach(set => list.append(createSetCard(set)));
      if (options.restoreScroll) restoreScrollPosition();
      else updateFloatingNavigation();
    } catch (error) {
      if (token !== overviewToken) return;
      list.innerHTML = "";
      list.append(createEmpty("SET-DATEN NICHT VERFÜGBAR", "Prüfe deine Internetverbindung und versuche es erneut."));
      console.error(error);
      if (options.restoreScroll) restoreScrollPosition();
      else updateFloatingNavigation();
    }
  }

  function cardMatchesDetailFilter(card) {
    if (detailFilter === "owned") return card.ownedQuantity > 0;
    if (detailFilter === "missing") return !card.ownedQuantity && !card.unlisted;
    if (detailFilter === "duplicates") return card.duplicateCopies > 0;
    if (detailFilter === "wishlist") return card.wishlistQuantity > 0;
    if (detailFilter === "trade") return card.tradeQuantity > 0;
    return true;
  }

  function cardmarketCard(set, card) {
    return {
      ...card,
      set: { ...set, ...(card.set || {}) },
      setId: card.setId || set.id,
      setName: card.setName || set.name,
      cardmarketSetCode: card.cardmarketSetCode || set.cardmarketSetCode || ""
    };
  }

  function buildCardmarketUrl(set, card) {
    return window.CardDexCore?.getCardmarketUrl?.(cardmarketCard(set, card))
      || window.CardDexCore?.buildCardmarketSearchUrl?.([card.name, set.cardmarketSetCode, card.localId].filter(Boolean).join(" "))
      || "https://www.cardmarket.com/de/Pokemon/Products/Search";
  }

  function createDuplicateManager(card) {
    const panel = document.createElement("div");
    panel.className = `set-duplicate-manager${expandedDuplicateKeys.has(card.key) ? "" : " hidden"}`;
    const duplicateEntries = (card.ownedEntries || []).filter(entry => Number(entry.groupDuplicateCopies || 0) > 0);
    if (!duplicateEntries.length) return panel;

    const heading = document.createElement("div");
    heading.className = "set-duplicate-manager-heading";
    heading.innerHTML = `<strong>DUBLETTEN-MANAGER</strong><span>${formatCount(card.duplicateCopies)} zusätzliche Exemplare · ${formatCount(card.tradeQuantity)} für Tausch</span>`;
    panel.append(heading);

    duplicateEntries.forEach(entry => {
      const ownQuantity = Math.max(0, Number(entry.quantity || 0));
      const maximumGroupTrade = Math.max(0, Number(entry.groupDuplicateCopies || 0));
      const groupTrade = Math.min(maximumGroupTrade, Math.max(0, Number(entry.groupTradeQuantity || 0)));
      const trade = Math.min(ownQuantity, Math.max(0, Number(entry.tradeQuantity || 0)));
      const row = document.createElement("div");
      row.className = "set-duplicate-entry";
      const info = document.createElement("div");
      const history = [
        Number(entry.soldQuantity || 0) ? `${formatCount(entry.soldQuantity)} verkauft` : "",
        Number(entry.tradedAwayQuantity || 0) ? `${formatCount(entry.tradedAwayQuantity)} getauscht` : ""
      ].filter(Boolean).join(" · ");
      info.innerHTML = `<strong>${escapeHtml(entry.collectionName || "Sammlung")}</strong><small>${escapeHtml(String(entry.language || "de").toUpperCase())} · ${escapeHtml(variantLabel(entry.variant))} · ${formatCount(entry.quantity)}× vorhanden · ${formatCount(trade)}× Tausch${history ? ` · ${escapeHtml(history)}` : ""}</small>`;
      const controls = document.createElement("div");
      controls.className = "set-duplicate-entry-actions";

      const lessTrade = document.createElement("button");
      lessTrade.type = "button";
      lessTrade.className = "mini-system-button";
      lessTrade.textContent = "− Tausch";
      lessTrade.disabled = trade <= 0;
      lessTrade.addEventListener("click", async () => {
        await window.CardDexSetEngine?.updateTradeQuantity?.(entry.id, -1);
        await renderDetail();
      });

      const moreTrade = document.createElement("button");
      moreTrade.type = "button";
      moreTrade.className = "mini-system-button";
      moreTrade.textContent = "+ Tausch";
      moreTrade.disabled = trade >= ownQuantity || groupTrade >= maximumGroupTrade;
      moreTrade.addEventListener("click", async () => {
        await window.CardDexSetEngine?.updateTradeQuantity?.(entry.id, 1);
        await renderDetail();
      });

      const sold = document.createElement("button");
      sold.type = "button";
      sold.className = "mini-system-button";
      sold.textContent = "Verkauft";
      sold.addEventListener("click", async () => {
        if (!confirm(`Ein Exemplar von „${card.name}“ als verkauft markieren und den Bestand um 1 verringern?`)) return;
        await window.CardDexSetEngine?.disposeDuplicate?.(entry.id, "sold");
        await renderDetail();
      });

      const traded = document.createElement("button");
      traded.type = "button";
      traded.className = "mini-system-button";
      traded.textContent = "Getauscht";
      traded.addEventListener("click", async () => {
        if (!confirm(`Ein Exemplar von „${card.name}“ als getauscht markieren und den Bestand um 1 verringern?`)) return;
        await window.CardDexSetEngine?.disposeDuplicate?.(entry.id, "traded");
        await renderDetail();
      });

      controls.append(lessTrade, moreTrade, sold, traded);
      row.append(info, controls);
      panel.append(row);
    });
    return panel;
  }

  function createSetDetailCard(set, card) {
    const article = document.createElement("article");
    article.className = `set-card-row${card.ownedQuantity ? " owned" : " missing"}${card.duplicateCopies ? " duplicate" : ""}${selectionMode ? " selection-mode" : ""}${selectedCardKeys.has(card.key) ? " selected" : ""}`;
    article.dataset.cardKey = card.key;

    if (selectionMode) {
      const selectLabel = document.createElement("label");
      selectLabel.className = "set-card-selection";
      selectLabel.setAttribute("aria-label", `${card.name} auswählen`);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedCardKeys.has(card.key);
      checkbox.addEventListener("change", () => toggleCardSelection(card.key, checkbox.checked));
      selectLabel.append(checkbox, document.createElement("i"));
      article.append(selectLabel);
    }

    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = card.name;
    image.src = card.directImage ? card.image : imageUrl(card.image, "low");
    image.onerror = () => { image.src = "icons/card-placeholder.svg"; };

    const body = document.createElement("div");
    body.className = "set-card-row-body";
    const top = document.createElement("div");
    top.className = "set-card-row-heading";
    const title = document.createElement("strong");
    title.textContent = card.name;
    const number = document.createElement("span");
    number.textContent = `Nr. ${card.localId || "–"}`;
    top.append(title, number);

    const badges = document.createElement("div");
    badges.className = "set-card-row-badges";
    if (card.ownedQuantity) {
      const owned = document.createElement("span");
      owned.className = "set-card-status owned";
      owned.textContent = card.ownedQuantity > 1 ? `${card.ownedQuantity}× VORHANDEN` : "VORHANDEN";
      badges.append(owned);
    } else {
      const missing = document.createElement("span");
      missing.className = "set-card-status missing";
      missing.textContent = "FEHLT";
      badges.append(missing);
    }
    if (card.goal && !card.goal.complete) {
      const goal = document.createElement("span");
      goal.className = "set-card-status goal";
      goal.textContent = `NOCH: ${card.goal.missingSlots.map(slot => slot.label).join(", ")}`;
      badges.append(goal);
    }
    if (card.duplicateCopies) {
      const duplicate = document.createElement("span");
      duplicate.className = "set-card-status duplicate";
      duplicate.textContent = `${card.duplicateCopies} DOPPELT`;
      badges.append(duplicate);
    }
    if (card.tradeQuantity) {
      const trade = document.createElement("span");
      trade.className = "set-card-status trade";
      trade.textContent = `${card.tradeQuantity}× TAUSCH`;
      badges.append(trade);
    }
    if (card.wishlistQuantity) {
      const wishlist = document.createElement("span");
      wishlist.className = "set-card-status wishlist";
      wishlist.textContent = `★ WUNSCHLISTE${card.wishlistQuantity > 1 ? ` ${card.wishlistQuantity}×` : ""}`;
      badges.append(wishlist);
    }
    if (card.unlisted) {
      const provisional = document.createElement("span");
      provisional.className = "set-card-status provisional";
      provisional.textContent = "LOKALER EINTRAG";
      badges.append(provisional);
    }

    const meta = document.createElement("small");
    meta.textContent = [card.rarity, card.category].filter(Boolean).join(" · ") || "Kartendaten";
    body.append(top, badges, meta);

    const actions = document.createElement("div");
    actions.className = "set-card-row-actions";
    const market = document.createElement("a");
    market.className = "mini-system-button";
    market.href = buildCardmarketUrl(set, card);
    market.target = "_blank";
    market.rel = "noopener noreferrer";
    market.textContent = "Cardmarket";
    market.addEventListener("click", event => {
      event.preventDefault();
      window.CardDexCore?.openCardmarket?.(cardmarketCard(set, card), { language: card.dataLanguage || set.language || "de" });
    });
    actions.append(market);

    if (card.ownedEntries?.length) {
      const detail = document.createElement("button");
      detail.type = "button";
      detail.className = "mini-system-button";
      detail.textContent = "Details";
      detail.addEventListener("click", () => window.CardDexCollections?.openEntryDetail?.(card.ownedEntries[0].id));
      actions.prepend(detail);
    } else {
      const wishlist = document.createElement("button");
      wishlist.type = "button";
      wishlist.className = "mini-system-button set-wishlist-action";
      wishlist.textContent = card.wishlistQuantity ? "★ Auf Wunschliste" : "☆ Wunschliste";
      wishlist.disabled = Boolean(card.wishlistQuantity);
      wishlist.addEventListener("click", async () => {
        wishlist.disabled = true;
        wishlist.textContent = "Wird gespeichert …";
        try {
          const wishlistCard = window.CardDexSetEngine.createWishlistCard(set, card);
          await window.CardDexCollections?.addToWishlist?.(wishlistCard, { language: wishlistCard._dataLanguage || "de" });
          wishlist.textContent = "★ Hinzugefügt";
          await renderDetail();
        } catch (error) {
          console.error(error);
          wishlist.disabled = false;
          wishlist.textContent = "Fehler – erneut tippen";
        }
      });
      actions.prepend(wishlist);
    }

    if (card.duplicateCopies) {
      const manage = document.createElement("button");
      manage.type = "button";
      manage.className = "mini-system-button duplicate-manager-toggle";
      manage.textContent = expandedDuplicateKeys.has(card.key) ? "Dubletten schließen" : "Dubletten verwalten";
      manage.addEventListener("click", () => {
        if (expandedDuplicateKeys.has(card.key)) expandedDuplicateKeys.delete(card.key);
        else expandedDuplicateKeys.add(card.key);
        void renderDetailCardsOnly();
      });
      actions.append(manage);
    }

    article.append(image, body, actions);
    const duplicatePanel = createDuplicateManager(card);
    if (duplicatePanel.childElementCount) article.append(duplicatePanel);
    return article;
  }

  function renderSetHeader(result) {
    const set = result.set;
    const goal = result.goalProgress || {
      goal: set.projectGoal || "numbers",
      owned: set.ownedUnique,
      target: set.total,
      missing: set.missing,
      progress: set.progress,
      complete: set.complete,
      regular: { owned: result.numberStats?.regular?.owned || 0, target: result.numberStats?.regular?.total || 0 },
      secret: { owned: result.numberStats?.secret?.owned || 0, target: result.numberStats?.secret?.total || 0 }
    };
    const logo = $("#setDetailLogo");
    if (logo) {
      logo.alt = `${set.name} Logo`;
      applyImageFallback(logo, setAssetSources(set));
    }
    setText("#setDetailName", set.name);
    setText("#setDetailCode", String(set.id || "").toUpperCase());
    setText("#setStickyName", set.name);
    setText("#setStickyProgress", `${goal.progress} % · ${formatCount(goal.owned)} / ${formatCount(goal.target || 0)}`);
    setText("#setDetailOwnedCount", goal.owned);
    setText("#setDetailTotalCount", goal.target || "–");
    setText("#setDetailProgressUnit", goal.goal === "numbers" ? "Karten" : "Sammelziele");
    setText("#setDetailRegularCount", `${formatCount(goal.regular?.owned || 0)} / ${formatCount(goal.regular?.target || 0)}`);
    setText("#setDetailSecretCount", `${formatCount(goal.secret?.owned || 0)} / ${formatCount(goal.secret?.target || 0)}`);
    setText("#setDetailMissingCount", goal.missing);
    setText("#setDetailDuplicateCount", set.duplicateCopies);
    setText("#setDetailWishlistCount", set.wishlistCount);
    setText("#setDetailPercent", `${goal.progress} %`);
    const bar = $("#setDetailProgressBar");
    if (bar) bar.style.width = `${goal.progress}%`;
    $("#setDetailPanel")?.classList.toggle("complete", goal.complete);
    const goalSelect = $("#setProjectGoalSelect");
    if (goalSelect) goalSelect.value = goal.goal || "numbers";
    setText("#setProjectGoalHint", goalHint(goal.goal));
    updateProjectDetailButton(set);
    updateBulkWishlistAction(result);
  }

  function getFilteredDetailCards() {
    if (!currentDetail) return [];
    const query = normalizeText(detailSearch);
    let cards = currentDetail.cards.filter(cardMatchesDetailFilter);
    if (query) cards = cards.filter(card => normalizeText(`${card.name} ${card.localId} ${card.rarity || ""}`).includes(query));
    return cards;
  }

  async function renderDetailCardsOnly() {
    const list = $("#setDetailCards");
    if (!list || !currentDetail) return;
    visibleDetailCards = getFilteredDetailCards();
    const summary = $("#setDetailFilterSummary");
    if (summary) summary.textContent = `${formatCount(visibleDetailCards.length)} Karten angezeigt${selectionMode ? ` · ${formatCount(selectedCardKeys.size)} ausgewählt` : ""}`;
    list.innerHTML = "";
    if (!visibleDetailCards.length) {
      list.append(createEmpty("KEINE PASSENDEN KARTEN", "Passe Filter oder Suchbegriff an."));
      updateSelectionToolbar();
      return;
    }
    const officialTotal = Number(currentDetail.set?.cardCount?.official || 0);
    let regularAnchorAssigned = false;
    let secretAnchorAssigned = false;
    visibleDetailCards.forEach(card => {
      const article = createSetDetailCard(currentDetail.set, card);
      const match = String(card.localId || "").match(/^(\d+)/);
      const secret = Boolean(match && officialTotal && Number(match[1]) > officialTotal);
      article.dataset.setZone = secret ? "secret" : "regular";
      if (!secret && !regularAnchorAssigned) {
        article.id = "setRegularCardsAnchor";
        regularAnchorAssigned = true;
      }
      if (secret && !secretAnchorAssigned) {
        article.id = "setSecretCardsAnchor";
        secretAnchorAssigned = true;
      }
      list.append(article);
    });
    updateSelectionToolbar();
    updateFloatingNavigation();
  }

  async function renderDetail(options = {}) {
    if (!selectedSetId) return;
    const token = ++detailToken;
    const list = $("#setDetailCards");
    if (!list) return;
    list.innerHTML = "";
    list.append(createLoading(options.force ? "Set wird aktualisiert …" : "Kartenliste wird geladen …"));

    try {
      const result = await window.CardDexSetEngine.getSetProgress(selectedSetId, {
        language: "de",
        force: Boolean(options.force)
      });
      if (token !== detailToken) return;
      currentDetail = result;
      renderSetHeader(result);

      const status = $("#setDetailStatus");
      if (status) {
        if (!result.catalogAvailable) {
          status.textContent = "Die vollständige Setliste ist gerade nicht erreichbar. Vorhandene lokale Karten werden trotzdem angezeigt.";
          status.classList.add("warning");
        } else if (result.stale) {
          status.textContent = "Offline-Modus: Zuletzt gespeicherte Kartendaten werden verwendet.";
          status.classList.add("warning");
        } else {
          status.textContent = result.goalProgress?.complete
            ? `Sammelziel „${goalLabel(result.goalProgress.goal)}“ vollständig erreicht.`
            : "Fehlende Karten und Varianten können gezielt ausgewählt, vorgemerkt oder als Dubletten verwaltet werden.";
          status.classList.remove("warning");
        }
      }

      await renderDetailCardsOnly();
      if (options.restoreScroll) restoreScrollPosition();
      else updateFloatingNavigation();
    } catch (error) {
      if (token !== detailToken) return;
      list.innerHTML = "";
      list.append(createEmpty("SET KONNTE NICHT GELADEN WERDEN", "Prüfe die Verbindung und versuche es erneut."));
      console.error(error);
      if (options.restoreScroll) restoreScrollPosition();
      else updateFloatingNavigation();
    }
  }

  function openSet(setId) {
    rememberScrollPosition();
    suppressScrollTracking = true;
    lastOpenedOverviewSetId = String(setId || "");
    selectedSetId = lastOpenedOverviewSetId;
    detailFilter = "all";
    detailSearch = "";
    selectionMode = false;
    selectedCardKeys.clear();
    expandedDuplicateKeys.clear();
    if (!detailScrollPositions.has(selectedSetId)) detailScrollPositions.set(selectedSetId, 0);
    if ($("#setDetailSearchInput")) $("#setDetailSearchInput").value = "";
    updateDetailChipState();
    setOverviewPanels(true);
    closeJumpMenu();
    restoreElementPosition($("#setDetailPanel"), "start");
    void renderDetail();
  }

  function closeSetDetail() {
    rememberScrollPosition();
    const setId = lastOpenedOverviewSetId;
    const fallbackTop = Number(overviewScrollTop || 0);
    suppressScrollTracking = true;
    selectedSetId = "";
    currentDetail = null;
    visibleDetailCards = [];
    selectionMode = false;
    selectedCardKeys.clear();
    expandedDuplicateKeys.clear();
    updateSelectionToolbar();
    setOverviewPanels(false);
    closeJumpMenu();
    const targetCard = setId ? document.querySelector(`[data-set-id="${CSS.escape(setId)}"]`) : null;
    if (targetCard) restoreElementPosition(targetCard, "center");
    else restoreScrollPosition(fallbackTop);
  }

  function wireOverviewControls() {
    $("#setOverviewMode")?.addEventListener("change", event => {
      overviewMode = ["owned", "projects", "all"].includes(event.target.value) ? event.target.value : "owned";
      void renderOverview();
    });
    $("#setOverviewSort")?.addEventListener("change", event => {
      overviewSort = event.target.value || "progress-desc";
      void renderOverview();
    });
    $("#setOverviewSearchInput")?.addEventListener("input", event => {
      overviewSearch = event.target.value || "";
      void renderOverview();
    });
    $("#clearSetOverviewSearchButton")?.addEventListener("click", () => {
      overviewSearch = "";
      if ($("#setOverviewSearchInput")) $("#setOverviewSearchInput").value = "";
      void renderOverview();
    });
    $("#refreshSetOverviewButton")?.addEventListener("click", () => {
      rememberScrollPosition();
      void renderOverview({ force: true, restoreScroll: true });
    });
    document.querySelectorAll("[data-set-overview-filter]").forEach(button => {
      button.addEventListener("click", () => {
        overviewFilter = button.dataset.setOverviewFilter || "all";
        updateOverviewChipState();
        void renderOverview();
      });
    });
  }

  function wireDetailControls() {
    $("#backToSetOverviewButton")?.addEventListener("click", closeSetDetail);
    $("#refreshSetDetailButton")?.addEventListener("click", () => {
      rememberScrollPosition();
      void renderDetail({ force: true, restoreScroll: true });
    });
    $("#setDetailProjectButton")?.addEventListener("click", () => {
      if (!selectedSetId) return;
      void toggleProject(selectedSetId, $("#setDetailProjectButton"));
    });
    $("#setProjectGoalSelect")?.addEventListener("change", event => {
      if (!selectedSetId) return;
      const goal = event.target.value || "numbers";
      window.CardDexSetEngine?.setProjectSettings?.(selectedSetId, { goal });
      if (!window.CardDexSetEngine?.isSetProject?.(selectedSetId)) {
        window.CardDexSetEngine?.setSetProject?.(selectedSetId, true);
      }
      void renderDetail();
    });
    $("#toggleSetSelectionButton")?.addEventListener("click", () => setSelectionMode(!selectionMode));
    $("#clearSetSelectionButton")?.addEventListener("click", () => {
      selectedCardKeys.clear();
      updateSelectionToolbar();
      void renderDetailCardsOnly();
    });
    $("#selectVisibleSetCardsButton")?.addEventListener("click", () => {
      visibleDetailCards.forEach(card => selectedCardKeys.add(card.key));
      updateSelectionToolbar();
      void renderDetailCardsOnly();
    });
    $("#addSelectedSetCardsToWishlistButton")?.addEventListener("click", async () => {
      if (!currentDetail) return;
      const candidates = getSelectedCards().filter(card => !card.ownedQuantity && !card.wishlistQuantity && !card.unlisted);
      if (!candidates.length) return;
      const cards = candidates.map(card => window.CardDexSetEngine.createWishlistCard(currentDetail.set, card));
      await window.CardDexCollections?.addCardsToWishlist?.(cards, { language: currentDetail.set.language || "de" });
      selectedCardKeys.clear();
      await renderDetail();
    });
    $("#removeSelectedSetCardsFromWishlistButton")?.addEventListener("click", async () => {
      const selected = getSelectedCards();
      const ids = selected.flatMap(card => (card.wishlistEntries || []).map(entry => entry.id));
      if (!ids.length) return;
      if (!confirm(`${ids.length} ${ids.length === 1 ? "Eintrag" : "Einträge"} von der Wunschliste entfernen?`)) return;
      await window.CardDexCollections?.removeWishlistEntries?.(ids);
      selectedCardKeys.clear();
      await renderDetail();
    });
    $("#addMissingSetToWishlistButton")?.addEventListener("click", async () => {
      if (!currentDetail) return;
      const candidates = missingWishlistCandidates(currentDetail);
      if (!candidates.length) return;
      const label = candidates.length === 1 ? "diese fehlende Karte" : `diese ${candidates.length} fehlenden Karten`;
      if (!confirm(`Möchtest du ${label} aus „${currentDetail.set.name}“ zur Wunschliste hinzufügen?`)) return;
      const button = $("#addMissingSetToWishlistButton");
      button.disabled = true;
      button.textContent = "Wunschliste wird ergänzt …";
      try {
        const cards = candidates.map(card => window.CardDexSetEngine.createWishlistCard(currentDetail.set, card));
        await window.CardDexCollections?.addCardsToWishlist?.(cards, { language: currentDetail.set.language || "de" });
        await renderDetail();
      } catch (error) {
        console.error(error);
        button.disabled = false;
        button.textContent = "Fehler – erneut versuchen";
      }
    });
    $("#setDetailSearchInput")?.addEventListener("input", event => {
      detailSearch = event.target.value || "";
      void renderDetailCardsOnly();
    });
    $("#clearSetDetailSearchButton")?.addEventListener("click", () => {
      detailSearch = "";
      if ($("#setDetailSearchInput")) $("#setDetailSearchInput").value = "";
      void renderDetailCardsOnly();
    });
    document.querySelectorAll("[data-set-detail-filter]").forEach(button => {
      button.addEventListener("click", () => {
        detailFilter = button.dataset.setDetailFilter || "all";
        updateDetailChipState();
        void renderDetailCardsOnly();
      });
    });
  }

  function wireNavigationControls() {
    $("#setScrollTopButton")?.addEventListener("click", () => {
      const panel = selectedSetId ? $("#setDetailPanel") : $("#setOverviewPanel");
      window.scrollTo({ top: panelTop(panel), behavior: "smooth" });
    });
    $("#openSetJumpMenuButton")?.addEventListener("click", () => {
      if (jumpMenuOpen) closeJumpMenu();
      else openJumpMenu();
    });
    $("#closeSetJumpMenuButton")?.addEventListener("click", closeJumpMenu);
    $("#setJumpMenuBackdrop")?.addEventListener("click", event => {
      if (event.target === event.currentTarget) closeJumpMenu();
    });
    window.addEventListener("keydown", event => {
      if (event.key === "Escape" && jumpMenuOpen) closeJumpMenu();
    });
    window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
    window.addEventListener("resize", updateFloatingNavigation, { passive: true });
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await window.CardDexSetEngine?.init?.();
    wireOverviewControls();
    wireDetailControls();
    wireNavigationControls();
    updateOverviewChipState();
    updateDetailChipState();
    window.CardDexCore?.on?.("collection-changed", () => {
      if (window.CardDexLibrary?.getActiveView?.() !== "sets") return;
      rememberScrollPosition();
      if (selectedSetId) void renderDetail({ restoreScroll: true });
      else void renderOverview({ restoreScroll: true });
    });
    window.CardDexCore?.on?.("set-projects-changed", () => {
      if (window.CardDexLibrary?.getActiveView?.() !== "sets") return;
      rememberScrollPosition();
      if (selectedSetId) void renderDetail({ restoreScroll: true });
      else void renderOverview({ restoreScroll: true });
    });
    window.CardDexCore?.on?.("set-project-settings-changed", () => {
      if (window.CardDexLibrary?.getActiveView?.() !== "sets" || !selectedSetId) return;
      rememberScrollPosition();
      void renderDetail({ restoreScroll: true });
    });
    window.CardDexCore?.on?.("view-changed", () => updateFloatingNavigation());
  }

  function activate(options = {}) {
    const restoreScroll = Boolean(options.restoreScroll);
    if (selectedSetId) void renderDetail({ restoreScroll });
    else void renderOverview({ restoreScroll });
    updateFloatingNavigation();
  }

  window.CardDexSetsUI = Object.freeze({
    init,
    activate,
    renderOverview,
    renderDetail,
    openSet,
    closeSetDetail,
    rememberScrollPosition,
    getSavedScrollPosition,
    getSelectedSetId: () => selectedSetId,
    getCurrentDetail: () => currentDetail
  });
})();
