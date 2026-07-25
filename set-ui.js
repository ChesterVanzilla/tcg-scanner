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
    if (overviewFilter === "incomplete") return set.ownedUnique > 0 && !set.complete;
    if (overviewFilter === "complete") return set.complete;
    if (overviewFilter === "duplicates") return set.duplicateCopies > 0;
    if (overviewFilter === "wishlist") return set.wishlistCount > 0;
    return true;
  }

  function sortOverviewSets(sets) {
    const collator = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    return [...sets].sort((a, b) => {
      if (overviewSort === "name") return collator.compare(a.name, b.name);
      if (overviewSort === "missing-desc") return b.missing - a.missing || collator.compare(a.name, b.name);
      if (overviewSort === "duplicates-desc") return b.duplicateCopies - a.duplicateCopies || collator.compare(a.name, b.name);
      if (overviewSort === "cards-desc") return b.ownedUnique - a.ownedUnique || collator.compare(a.name, b.name);
      return b.progress - a.progress || b.ownedUnique - a.ownedUnique || collator.compare(a.name, b.name);
    });
  }

  function createSetCard(set) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `set-overview-card${set.complete ? " complete" : ""}`;
    button.dataset.setId = set.id;

    const visual = document.createElement("span");
    visual.className = "set-overview-visual";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = `${set.name} Logo`;
    image.src = set.logo || set.symbol || "icons/card-placeholder.svg";
    image.onerror = () => {
      if (set.symbol && image.src !== set.symbol) image.src = set.symbol;
      else image.src = "icons/card-placeholder.svg";
    };
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
    const totalLabel = set.total ? `${formatCount(set.ownedUnique)} / ${formatCount(set.total)}` : `${formatCount(set.ownedUnique)} gesammelt`;
    stats.innerHTML = `<b>${escapeHtml(totalLabel)}</b><small>${set.missing ? `${formatCount(set.missing)} fehlen` : set.complete ? "SET KOMPLETT" : "Gesamtzahl nicht verfügbar"}${set.duplicateCopies ? ` · ${formatCount(set.duplicateCopies)} doppelt` : ""}</small>`;

    const progress = document.createElement("span");
    progress.className = "set-progress-track";
    const fill = document.createElement("i");
    fill.style.width = `${set.progress}%`;
    progress.append(fill);

    const footer = document.createElement("span");
    footer.className = "set-overview-footer";
    const status = document.createElement("span");
    status.className = set.complete ? "set-complete-badge" : "set-progress-badge";
    status.textContent = set.complete ? "✓ VOLLSTÄNDIG" : `${set.progress} %`;
    const wishlist = document.createElement("span");
    wishlist.textContent = set.wishlistCount ? `★ ${formatCount(set.wishlistCount)} Wunschliste` : "Details öffnen";
    footer.append(status, wishlist);

    body.append(heading, stats, progress, footer);
    button.append(visual, body);
    button.addEventListener("click", () => openSet(set.id));
    return button;
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
        includeAll: overviewMode === "all",
        language: "de",
        force: Boolean(options.force)
      });
      if (token !== overviewToken) return;

      setText("#setStartedCount", result.stats.started);
      setText("#setCompleteCount", result.stats.complete);
      setText("#setMissingCount", result.stats.missing);
      setText("#setDuplicateCopiesCount", result.stats.duplicateCopies);

      const query = normalizeText(overviewSearch);
      let sets = result.sets.filter(set => overviewMode === "all" || set.ownedUnique > 0);
      sets = sets.filter(matchesOverviewFilter);
      if (query) {
        sets = sets.filter(set => normalizeText(`${set.name} ${set.id} ${set.serie?.name || ""}`).includes(query));
      }
      sets = sortOverviewSets(sets);

      const summary = $("#setOverviewSummary");
      if (summary) {
        const sourceText = result.stale ? " · Offline-Daten" : "";
        summary.textContent = `${formatCount(sets.length)} Sets angezeigt${sourceText}`;
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
          status.textContent = "Fortschritt basiert auf allen bekannten Karten eines Sets, einschließlich Secret Rares.";
          status.classList.remove("warning");
        }
      }

      list.innerHTML = "";
      if (!sets.length) {
        list.append(createEmpty(
          overviewMode === "owned" ? "NOCH KEIN SET GESTARTET" : "KEINE PASSENDEN SETS",
          overviewMode === "owned"
            ? "Sobald du eine Karte zu deiner Sammlung hinzufügst, erscheint das zugehörige Set hier automatisch."
            : "Passe Suche oder Filter an."
        ));
        return;
      }
      sets.forEach(set => list.append(createSetCard(set)));
    } catch (error) {
      if (token !== overviewToken) return;
      list.innerHTML = "";
      list.append(createEmpty("SET-DATEN NICHT VERFÜGBAR", "Prüfe deine Internetverbindung und versuche es erneut."));
      console.error(error);
    }
  }

  function cardMatchesDetailFilter(card) {
    if (detailFilter === "owned") return card.ownedQuantity > 0;
    if (detailFilter === "missing") return !card.ownedQuantity && !card.unlisted;
    if (detailFilter === "duplicates") return card.duplicateCopies > 0;
    if (detailFilter === "wishlist") return card.wishlistQuantity > 0;
    return true;
  }

  function buildCardmarketUrl(set, card) {
    const query = [card.name, set.name, card.localId].filter(Boolean).join(" ");
    return window.CardDexCore?.buildCardmarketSearchUrl?.(query) || "https://www.cardmarket.com/de/Pokemon/Products/Search";
  }

  function createSetDetailCard(set, card) {
    const article = document.createElement("article");
    article.className = `set-card-row${card.ownedQuantity ? " owned" : " missing"}${card.duplicateCopies ? " duplicate" : ""}`;

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
    if (card.duplicateCopies) {
      const duplicate = document.createElement("span");
      duplicate.className = "set-card-status duplicate";
      duplicate.textContent = `${card.duplicateCopies} DOPPELT`;
      badges.append(duplicate);
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

    article.append(image, body, actions);
    return article;
  }

  function renderSetHeader(result) {
    const set = result.set;
    const logo = $("#setDetailLogo");
    if (logo) {
      logo.src = set.logo || set.symbol || "icons/card-placeholder.svg";
      logo.alt = `${set.name} Logo`;
      logo.onerror = () => {
        if (set.symbol && logo.src !== set.symbol) logo.src = set.symbol;
        else logo.src = "icons/card-placeholder.svg";
      };
    }
    setText("#setDetailName", set.name);
    setText("#setDetailCode", String(set.id || "").toUpperCase());
    setText("#setDetailOwnedCount", set.ownedUnique);
    setText("#setDetailTotalCount", set.total || "–");
    setText("#setDetailMissingCount", set.missing);
    setText("#setDetailDuplicateCount", set.duplicateCopies);
    setText("#setDetailWishlistCount", set.wishlistCount);
    setText("#setDetailPercent", `${set.progress} %`);
    const bar = $("#setDetailProgressBar");
    if (bar) bar.style.width = `${set.progress}%`;
    $("#setDetailPanel")?.classList.toggle("complete", set.complete);
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

      const query = normalizeText(detailSearch);
      let cards = result.cards.filter(cardMatchesDetailFilter);
      if (query) cards = cards.filter(card => normalizeText(`${card.name} ${card.localId} ${card.rarity || ""}`).includes(query));

      const summary = $("#setDetailFilterSummary");
      if (summary) summary.textContent = `${formatCount(cards.length)} Karten angezeigt`;
      const status = $("#setDetailStatus");
      if (status) {
        if (!result.catalogAvailable) {
          status.textContent = "Die vollständige Setliste ist gerade nicht erreichbar. Vorhandene lokale Karten werden trotzdem angezeigt.";
          status.classList.add("warning");
        } else if (result.stale) {
          status.textContent = "Offline-Modus: Zuletzt gespeicherte Kartendaten werden verwendet.";
          status.classList.add("warning");
        } else {
          status.textContent = result.set.complete
            ? "Set vollständig – alle bekannten Karten sind in deiner Sammlung vorhanden."
            : "Fehlende Karten können direkt auf die Wunschliste gesetzt oder bei Cardmarket gesucht werden.";
          status.classList.remove("warning");
        }
      }

      list.innerHTML = "";
      if (!cards.length) {
        list.append(createEmpty("KEINE PASSENDEN KARTEN", "Passe Filter oder Suchbegriff an."));
        return;
      }
      cards.forEach(card => list.append(createSetDetailCard(result.set, card)));
    } catch (error) {
      if (token !== detailToken) return;
      list.innerHTML = "";
      list.append(createEmpty("SET KONNTE NICHT GELADEN WERDEN", "Prüfe die Verbindung und versuche es erneut."));
      console.error(error);
    }
  }

  function openSet(setId) {
    selectedSetId = String(setId || "");
    detailFilter = "all";
    detailSearch = "";
    if ($("#setDetailSearchInput")) $("#setDetailSearchInput").value = "";
    updateDetailChipState();
    setOverviewPanels(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    void renderDetail();
  }

  function closeSetDetail() {
    selectedSetId = "";
    currentDetail = null;
    setOverviewPanels(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function wireOverviewControls() {
    $("#setOverviewMode")?.addEventListener("change", event => {
      overviewMode = event.target.value === "all" ? "all" : "owned";
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
    $("#refreshSetOverviewButton")?.addEventListener("click", () => void renderOverview({ force: true }));
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
    $("#refreshSetDetailButton")?.addEventListener("click", () => void renderDetail({ force: true }));
    $("#setDetailSearchInput")?.addEventListener("input", event => {
      detailSearch = event.target.value || "";
      void renderDetail();
    });
    $("#clearSetDetailSearchButton")?.addEventListener("click", () => {
      detailSearch = "";
      if ($("#setDetailSearchInput")) $("#setDetailSearchInput").value = "";
      void renderDetail();
    });
    document.querySelectorAll("[data-set-detail-filter]").forEach(button => {
      button.addEventListener("click", () => {
        detailFilter = button.dataset.setDetailFilter || "all";
        updateDetailChipState();
        void renderDetail();
      });
    });
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await window.CardDexSetEngine?.init?.();
    wireOverviewControls();
    wireDetailControls();
    updateOverviewChipState();
    updateDetailChipState();
    window.CardDexCore?.on?.("collection-changed", () => {
      if (window.CardDexLibrary?.getActiveView?.() !== "sets") return;
      if (selectedSetId) void renderDetail();
      else void renderOverview();
    });
  }

  function activate() {
    if (selectedSetId) void renderDetail();
    else void renderOverview();
  }

  window.CardDexSetsUI = Object.freeze({
    init,
    activate,
    renderOverview,
    renderDetail,
    openSet,
    closeSetDetail,
    getSelectedSetId: () => selectedSetId,
    getCurrentDetail: () => currentDetail
  });
})();
