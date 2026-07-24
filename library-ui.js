"use strict";

(() => {
  const VIEW_IDS = ["dashboard", "scanner", "collection", "history"];
  const STATUS_LABELS = {
    verified: "VERIFIZIERT",
    provisional: "VORLÄUFIG",
    review: "PRÜFEN"
  };
  let initialized = false;
  let activeView = "dashboard";
  let historyFilter = "all";
  let dashboardRenderToken = 0;
  let historyRenderToken = 0;

  const $ = selector => document.querySelector(selector);

  function switchView(view, options = {}) {
    const next = VIEW_IDS.includes(view) ? view : "dashboard";
    activeView = next;
    VIEW_IDS.forEach(name => {
      $(`#${name}View`)?.classList.toggle("hidden", name !== next);
      const button = $(`#show${name[0].toUpperCase()}${name.slice(1)}View`);
      button?.classList.toggle("active", name === next);
      button?.setAttribute("aria-selected", String(name === next));
      button?.setAttribute("tabindex", name === next ? "0" : "-1");
    });

    if (next === "collection") window.CardDexCollections?.refresh?.();
    if (next === "dashboard") void renderDashboard();
    if (next === "history") void renderHistory();

    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: options.instant ? "auto" : "smooth" });
    window.CardDexCore?.emit?.("view-changed", { view: next });
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || STATUS_LABELS.review;
  }

  function statusClass(status) {
    return ["verified", "provisional", "review"].includes(status) ? status : "review";
  }

  function formatDayHeading(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unbekanntes Datum";
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const key = window.CardDexCore?.localDayKey?.(date);
    if (key === window.CardDexCore?.localDayKey?.(today)) return "Heute";
    if (key === window.CardDexCore?.localDayKey?.(yesterday)) return "Gestern";
    return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(date);
  }

  function createStatusBadge(status) {
    const badge = document.createElement("span");
    badge.className = `library-status-badge ${statusClass(status)}`;
    badge.textContent = statusLabel(status);
    return badge;
  }

  function createRecentRow(record) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dashboard-recent-row";
    button.dataset.historyId = record.id;

    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = record.card?.name || "Pokémon-Karte";
    image.src = window.CardDexCore?.resolveCardImage?.(record.card, "low") || "icons/card-placeholder.svg";
    image.onerror = () => { image.src = "icons/card-placeholder.svg"; };

    const info = document.createElement("span");
    info.className = "dashboard-recent-info";
    const title = document.createElement("strong");
    title.textContent = record.card?.name || "Unbekannte Karte";
    const meta = document.createElement("small");
    meta.textContent = `${window.CardDexCore?.formatTime?.(record.createdAt) || "–"} · ${record.card?.setName || "Set nicht angegeben"} · ${record.card?.localId || "–"}`;
    info.append(title, meta);

    button.append(image, info, createStatusBadge(record.status));
    button.addEventListener("click", () => {
      switchView("history");
      setTimeout(() => {
        const target = document.querySelector(`[data-history-card-id="${CSS.escape(record.id)}"]`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.classList.add("history-focus");
        setTimeout(() => target?.classList.remove("history-focus"), 1500);
      }, 80);
    });
    return button;
  }

  async function renderDashboard() {
    const token = ++dashboardRenderToken;
    const engine = window.CardDexLibraryEngine;
    if (!engine) return;
    const data = await engine.getDashboardData().catch(error => {
      console.warn("Dashboard konnte nicht geladen werden:", error);
      return null;
    });
    if (!data || token !== dashboardRenderToken) return;

    setText("#dashboardTotalCards", data.totalCopies);
    setText("#dashboardUniqueCards", data.uniqueCards);
    setText("#dashboardCollectionCount", data.collectionCount);
    setText("#dashboardTodayScans", data.todayScans);
    setText("#dashboardVerifiedToday", data.verifiedToday);
    setText("#dashboardReviewToday", data.reviewToday);

    const verification = data.todayScans ? Math.round((data.verifiedToday / data.todayScans) * 100) : 0;
    setText("#dashboardVerificationRate", `${verification} %`);
    const bar = $("#dashboardVerificationBar");
    if (bar) bar.style.width = `${verification}%`;

    const recent = $("#dashboardRecentScans");
    if (recent) {
      recent.innerHTML = "";
      if (!data.recentHistory.length) {
        recent.append(createEmptyState("NOCH KEINE SCANS", "Der erste erkannte Datensatz erscheint automatisch an dieser Stelle."));
      } else {
        data.recentHistory.forEach(record => recent.append(createRecentRow(record)));
      }
    }

    const collections = $("#dashboardCollections");
    if (collections) {
      collections.innerHTML = "";
      if (!data.collections.length) {
        collections.append(createEmptyState("KEINE SAMMLUNG", "Die lokale Datenbank wird beim nächsten Start automatisch vorbereitet."));
      } else {
        data.collections.slice(0, 5).forEach(collection => {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "dashboard-collection-row";
          const name = document.createElement("span");
          name.innerHTML = `<i class="status-light ${collection.count ? "state-green" : "state-off"}"></i>`;
          const text = document.createElement("strong");
          text.textContent = collection.name || "Sammlung";
          name.append(text);
          const count = document.createElement("b");
          count.textContent = `${collection.count || 0} Karten`;
          row.append(name, count);
          row.addEventListener("click", () => {
            const select = $("#activeCollectionSelect");
            if (select && collection.id) {
              select.value = collection.id;
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
            switchView("collection");
          });
          collections.append(row);
        });
      }
    }
  }

  function createEmptyState(title, text) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    empty.append(strong, paragraph);
    return empty;
  }

  function buildHistorySearchUrl(record) {
    const direct = String(record.cardmarketUrl || record.card?.cardmarketUrl || "").trim();
    if (/^https:\/\/(?:www\.)?cardmarket\.com\/[^\s]+/i.test(direct)) return direct;
    const recognition = record.recognition || {};
    const card = record.card || {};
    const query = [
      card.englishName || card.name || recognition.name,
      card.cardmarketSetCode || recognition.setCode,
      card.localId || recognition.number
    ].filter(Boolean).join(" ");
    return window.CardDexCore?.buildCardmarketSearchUrl?.(query) || "https://www.cardmarket.com/de/Pokemon/Products/Search";
  }

  function createHistoryCard(record, collections) {
    const article = document.createElement("article");
    article.className = "history-card";
    article.dataset.historyCardId = record.id;

    const top = document.createElement("div");
    top.className = "history-card-main";
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = record.card?.name || "Pokémon-Karte";
    image.src = window.CardDexCore?.resolveCardImage?.(record.card, "low") || record.scanPreview || "icons/card-placeholder.svg";
    image.onerror = () => {
      if (record.scanPreview && image.src !== record.scanPreview) image.src = record.scanPreview;
      else image.src = "icons/card-placeholder.svg";
    };

    const info = document.createElement("div");
    info.className = "history-card-info";
    const headingRow = document.createElement("div");
    headingRow.className = "history-card-heading";
    const title = document.createElement("h3");
    title.textContent = record.card?.name || "Unbekannte Karte";
    headingRow.append(title, createStatusBadge(record.status));

    const meta = document.createElement("p");
    const number = record.card?.localId || record.recognition?.number || "–";
    meta.textContent = `${record.card?.setName || "Set nicht angegeben"} · Nr. ${number}${record.card?.officialTotal ? `/${record.card.officialTotal}` : ""}`;

    const sub = document.createElement("div");
    sub.className = "history-card-subline";
    const time = document.createElement("span");
    time.textContent = `${window.CardDexCore?.formatTime?.(record.createdAt) || "–"} · ${record.source === "manual" ? "MANUELLE SUCHE" : "SCAN"}`;
    const confidence = document.createElement("span");
    confidence.textContent = record.confidence ? `SICHERHEIT ${record.confidence} %` : `${record.candidateCount || 0} TREFFER`;
    sub.append(time, confidence);

    info.append(headingRow, meta, sub);
    top.append(image, info);

    const actionRow = document.createElement("div");
    actionRow.className = "history-card-actions";

    const market = document.createElement("a");
    market.className = "mini-system-button history-market-link";
    market.target = "_blank";
    market.rel = "noopener noreferrer";
    market.href = buildHistorySearchUrl(record);
    market.textContent = "Cardmarket";

    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "mini-system-button";
    retry.textContent = "Erneut prüfen";
    retry.addEventListener("click", () => window.CardDexScanner?.searchFromHistory?.(record));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mini-system-button danger-button";
    remove.textContent = "Löschen";
    remove.addEventListener("click", async () => {
      if (!confirm(`„${record.card?.name || "Diesen Scan"}“ aus der Historie löschen?`)) return;
      await window.CardDexLibraryEngine?.deleteHistory?.(record.id);
    });

    actionRow.append(market, retry, remove);

    const collectionRow = document.createElement("div");
    collectionRow.className = "history-collection-actions";
    const select = document.createElement("select");
    select.setAttribute("aria-label", "Zielsammlung auswählen");
    collections.forEach(collection => {
      const option = document.createElement("option");
      option.value = collection.id;
      option.textContent = collection.name;
      select.append(option);
    });
    const activeId = window.CardDexCollections?.getActiveCollectionId?.();
    if (activeId && collections.some(item => item.id === activeId)) select.value = activeId;

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-collection-button";
    add.textContent = record.addedToCollection ? "Erneut hinzufügen" : "Zur Sammlung";
    add.disabled = !collections.length;
    add.addEventListener("click", async () => {
      add.disabled = true;
      const original = add.textContent;
      try {
        await window.CardDexCollections?.addCard?.(record.card, {
          collectionId: select.value || activeId,
          language: record.language || "de"
        });
        await window.CardDexLibraryEngine?.updateHistory?.(record.id, { addedToCollection: true });
        add.textContent = "Hinzugefügt ✓";
      } catch (error) {
        console.error(error);
        add.textContent = "Speichern fehlgeschlagen";
      } finally {
        setTimeout(() => {
          add.disabled = !collections.length;
          add.textContent = original === "Erneut hinzufügen" ? original : "Erneut hinzufügen";
        }, 1300);
      }
    });
    collectionRow.append(select, add);

    article.append(top, actionRow, collectionRow);
    return article;
  }

  async function renderHistory() {
    const token = ++historyRenderToken;
    const engine = window.CardDexLibraryEngine;
    if (!engine) return;
    const [records, collections] = await Promise.all([
      engine.getHistory().catch(() => []),
      engine.getCollections().catch(() => [])
    ]);
    if (token !== historyRenderToken) return;

    const filtered = historyFilter === "all" ? records : records.filter(record => record.status === historyFilter);
    setText("#historyTotalCount", records.length);
    setText("#historyVerifiedCount", records.filter(record => record.status === "verified").length);
    setText("#historyReviewCount", records.filter(record => record.status !== "verified").length);

    const list = $("#historyList");
    if (!list) return;
    list.innerHTML = "";
    if (!filtered.length) {
      list.append(createEmptyState(historyFilter === "all" ? "NOCH KEINE SCANS" : "KEINE PASSENDEN EINTRÄGE", "Scannergebnisse werden automatisch lokal gespeichert und können hier erneut geprüft werden."));
      return;
    }

    let lastDay = "";
    filtered.forEach(record => {
      const day = window.CardDexCore?.localDayKey?.(record.createdAt) || "unknown";
      if (day !== lastDay) {
        const heading = document.createElement("h3");
        heading.className = "history-day-heading";
        heading.textContent = formatDayHeading(record.createdAt);
        list.append(heading);
        lastDay = day;
      }
      list.append(createHistoryCard(record, collections));
    });
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = String(value ?? "0");
  }

  function wireNavigation() {
    VIEW_IDS.forEach(view => {
      const id = `#show${view[0].toUpperCase()}${view.slice(1)}View`;
      $(id)?.addEventListener("click", () => switchView(view));
    });
    document.querySelectorAll("[data-carddex-view]").forEach(button => {
      button.addEventListener("click", () => switchView(button.dataset.carddexView));
    });
    $("#dashboardStartScanner")?.addEventListener("click", () => {
      switchView("scanner", { instant: true });
      setTimeout(() => window.CardDexScanner?.openLiveScanner?.(), 50);
    });
  }

  function wireHistoryControls() {
    $("#historyFilter")?.addEventListener("change", event => {
      historyFilter = event.target.value || "all";
      void renderHistory();
    });
    $("#clearHistoryButton")?.addEventListener("click", async () => {
      if (!confirm("Die komplette Scannerhistorie auf diesem Gerät löschen? Deine Sammlungen bleiben erhalten.")) return;
      await window.CardDexLibraryEngine?.clearHistory?.();
    });
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    try {
      await window.CardDexLibraryEngine?.init?.();
      wireNavigation();
      wireHistoryControls();
      window.CardDexCore?.on?.("history-changed", () => {
        if (activeView === "history") void renderHistory();
        void renderDashboard();
      });
      window.CardDexCore?.on?.("collection-changed", () => void renderDashboard());
      switchView("dashboard", { instant: true });
      await renderDashboard();
    } catch (error) {
      console.error("CardDex Library konnte nicht initialisiert werden:", error);
    }
  }

  window.CardDexLibrary = Object.freeze({
    init,
    switchView,
    renderDashboard,
    renderHistory,
    getActiveView: () => activeView
  });
})();
