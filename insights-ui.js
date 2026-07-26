"use strict";

(() => {
  let initialized = false;
  let renderToken = 0;
  let lastData = null;
  const $ = selector => document.querySelector(selector);

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = String(value ?? "0");
  }

  function formatEuro(value) {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function formatCompact(value) {
    return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatShortDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit" }).format(date).replace(".", "");
  }

  function createEmpty(title, text) {
    const empty = document.createElement("div");
    empty.className = "insights-empty";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    empty.append(strong, paragraph);
    return empty;
  }

  function createProgressRow({ label, meta = "", value = 0, max = 0, percent = null, action = null, accent = "green" }) {
    const row = document.createElement(action ? "button" : "div");
    if (action) row.type = "button";
    row.className = `insights-progress-row accent-${accent}`;

    const heading = document.createElement("div");
    heading.className = "insights-progress-heading";
    const name = document.createElement("strong");
    name.textContent = label;
    const number = document.createElement("span");
    number.textContent = meta || `${formatCompact(value)}${max ? ` / ${formatCompact(max)}` : ""}`;
    heading.append(name, number);

    const calculated = percent === null
      ? (max ? Math.min(100, Math.round((Number(value || 0) / Number(max || 1)) * 100)) : 0)
      : Math.max(0, Math.min(100, Number(percent || 0)));
    const track = document.createElement("div");
    track.className = "insights-progress-track";
    const fill = document.createElement("i");
    fill.style.width = `${calculated}%`;
    track.append(fill);

    row.append(heading, track);
    if (action) row.addEventListener("click", action);
    return row;
  }

  function renderCollectionBreakdown(data) {
    const container = $("#insightsCollectionBreakdown");
    if (!container) return;
    container.innerHTML = "";
    if (!data.collections.length) {
      container.append(createEmpty("NOCH KEINE SAMMLUNGSDATEN", "Sobald Karten in einer Sammlung liegen, wird hier ihre Verteilung sichtbar."));
      return;
    }
    const max = Math.max(1, ...data.collections.map(collection => collection.copies));
    data.collections.slice(0, 8).forEach(collection => {
      container.append(createProgressRow({
        label: collection.name,
        meta: `${formatCompact(collection.copies)} Exemplare · ${formatCompact(collection.unique)} verschieden`,
        value: collection.copies,
        max,
        action: () => {
          const select = $("#activeCollectionSelect");
          if (select) {
            select.value = collection.id;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          window.CardDexLibrary?.switchView?.("collection");
        }
      }));
    });
  }

  function renderDistribution(containerSelector, items, emptyTitle) {
    const container = $(containerSelector);
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) {
      container.append(createEmpty(emptyTitle, "Für diese Auswertung sind noch keine Kartendaten vorhanden."));
      return;
    }
    const max = Math.max(1, ...items.map(item => item.value));
    items.slice(0, 8).forEach(item => {
      container.append(createProgressRow({
        label: item.label,
        meta: `${formatCompact(item.value)} Exemplare`,
        value: item.value,
        max,
        accent: "amber"
      }));
    });
  }

  function openSet(setId) {
    window.CardDexLibrary?.switchView?.("sets", { instant: true });
    setTimeout(() => window.CardDexSetsUI?.openSet?.(setId), 60);
  }

  function renderTopSets(data) {
    const container = $("#insightsTopSets");
    if (!container) return;
    container.innerHTML = "";
    if (!data.sets.top.length) {
      container.append(createEmpty("NOCH KEINE SET-AUSWERTUNG", "Scanne oder speichere Karten mit Setzuordnung, damit die stärksten Sets sichtbar werden."));
      return;
    }
    data.sets.top.forEach(set => {
      const progress = Number(set.displayProgress ?? set.progress ?? 0);
      const owned = Number(set.displayOwned ?? set.ownedUnique ?? 0);
      const total = Number(set.displayTotal ?? set.total ?? 0);
      container.append(createProgressRow({
        label: set.name || set.id,
        meta: `${formatCompact(owned)}${total ? ` / ${formatCompact(total)}` : " Karten"} · ${progress} %`,
        value: owned,
        max: total || Math.max(owned, 1),
        percent: progress,
        action: () => openSet(set.id),
        accent: set.displayComplete || set.complete ? "green" : "red"
      }));
    });
  }

  function renderProjects(data) {
    const container = $("#insightsProjectList");
    if (!container) return;
    container.innerHTML = "";
    if (!data.sets.projects.length) {
      container.append(createEmpty("KEIN SET-PROJEKT AKTIV", "Markiere in der Set-Übersicht ein Set mit dem Stern, um seinen Fortschritt hier zu verfolgen."));
      return;
    }
    data.sets.projects.slice(0, 8).forEach(project => {
      const progress = Number(project.displayProgress ?? project.progress ?? 0);
      const missing = Number(project.displayMissing ?? project.missing ?? 0);
      container.append(createProgressRow({
        label: `${project.displayComplete || project.complete ? "✓ " : "★ "}${project.name || project.id}`,
        meta: project.displayComplete || project.complete ? "Abgeschlossen" : `${formatCompact(missing)} fehlen · ${progress} %`,
        percent: progress,
        action: () => openSet(project.id),
        accent: project.displayComplete || project.complete ? "green" : "amber"
      }));
    });
  }

  function renderActivity(data) {
    const chart = $("#insightsActivityChart");
    if (!chart) return;
    chart.innerHTML = "";
    const maximum = Math.max(1, ...data.activity.days.map(day => day.total));
    data.activity.days.forEach(day => {
      const column = document.createElement("div");
      column.className = "insights-activity-column";
      const count = document.createElement("strong");
      count.textContent = String(day.total);
      const bar = document.createElement("div");
      bar.className = "insights-activity-bar";
      const fill = document.createElement("i");
      fill.style.height = `${day.total ? Math.max(12, Math.round((day.total / maximum) * 100)) : 3}%`;
      fill.classList.toggle("has-review", day.review > 0);
      bar.append(fill);
      const label = document.createElement("span");
      label.textContent = formatShortDate(day.date);
      column.append(count, bar, label);
      chart.append(column);
    });
  }

  function setQualityStatus(selector, count, goodWhenZero = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = formatCompact(count);
    const card = element.closest(".insights-quality-card");
    card?.classList.toggle("quality-good", goodWhenZero && Number(count) === 0);
    card?.classList.toggle("quality-warning", Number(count) > 0);
  }

  async function render(options = {}) {
    const token = ++renderToken;
    const status = $("#insightsDataStatus");
    const refresh = $("#refreshInsightsButton");
    if (status) status.textContent = options.force ? "Auswertung wird vollständig aktualisiert …" : "Lokale Daten werden ausgewertet …";
    if (refresh) refresh.disabled = true;

    try {
      const data = await window.CardDexInsightsEngine?.getInsightsData?.({ force: Boolean(options.force) });
      if (!data || token !== renderToken) return;
      lastData = data;

      setText("#insightsTotalCopies", formatCompact(data.totals.totalCopies));
      setText("#insightsUniqueCards", formatCompact(data.totals.uniqueCards));
      setText("#insightsDuplicateCopies", formatCompact(data.totals.duplicateCopies));
      setText("#insightsTradeCopies", formatCompact(data.totals.tradeQuantity));
      setText("#insightsWishlistCards", formatCompact(data.totals.wishlistCount));
      setText("#insightsPurchaseInvestment", formatEuro(data.totals.purchaseInvestment));
      setText("#insightsUniqueVariants", formatCompact(data.totals.uniqueVariants));
      setText("#insightsSoldCopies", formatCompact(data.totals.soldQuantity));
      setText("#insightsTradedCopies", formatCompact(data.totals.tradedAwayQuantity));
      setText("#insightsWishlistBudget", formatEuro(data.totals.wishlistTargetBudget));

      setText("#insightsProjectCount", formatCompact(data.sets.projectCount));
      setText("#insightsCompletedProjects", formatCompact(data.sets.completedProjects));
      setText("#insightsProjectMissing", formatCompact(data.sets.projectMissing));
      setText("#insightsAverageProjectProgress", `${data.sets.averageProjectProgress} %`);

      setText("#insightsScans7", formatCompact(data.activity.last7));
      setText("#insightsScans30", formatCompact(data.activity.last30));
      setText("#insightsVerification30", `${data.activity.verificationRate30} %`);

      setQualityStatus("#insightsProvisionalCards", data.quality.provisional, true);
      setQualityStatus("#insightsReviewCards", data.quality.review, true);
      setQualityStatus("#insightsMissingImages", data.quality.missingImages, true);
      setQualityStatus("#insightsUnpricedEntries", data.quality.unpricedEntries, true);

      renderCollectionBreakdown(data);
      renderDistribution("#insightsLanguageBreakdown", data.languages, "KEINE SPRACHVERTEILUNG");
      renderDistribution("#insightsVariantBreakdown", data.variants, "KEINE VARIANTENVERTEILUNG");
      renderTopSets(data);
      renderProjects(data);
      renderActivity(data);

      if (status) {
        const setHint = data.sets.error
          ? " · Set-Fortschritt aus lokal verfügbaren Daten"
          : data.sets.stale
            ? " · Set-Katalog aus Cache"
            : "";
        status.textContent = `Stand ${new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.generatedAt))}${setHint}`;
        status.classList.toggle("warning", Boolean(data.sets.error));
      }
    } catch (error) {
      console.error("Insights konnten nicht geladen werden:", error);
      if (status) {
        status.textContent = "Die Statistik konnte nicht geladen werden. Bitte erneut versuchen.";
        status.classList.add("warning");
      }
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await window.CardDexInsightsEngine?.init?.();
    $("#refreshInsightsButton")?.addEventListener("click", () => void render({ force: true }));
    const openCollectionFilter = (filterName, statisticName) => {
      const targetCollection = (lastData?.collections || [])
        .slice()
        .sort((a, b) => Number(b?.[statisticName] || 0) - Number(a?.[statisticName] || 0))[0];
      const select = $("#activeCollectionSelect");
      if (select && targetCollection?.id) {
        select.value = targetCollection.id;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.CardDexLibrary?.switchView?.("collection");
      setTimeout(() => document.querySelector(`[data-collection-filter="${filterName}"]`)?.click(), 90);
    };
    $("#insightsOpenDuplicates")?.addEventListener("click", () => openCollectionFilter("duplicates", "duplicates"));
    $("#insightsOpenTrade")?.addEventListener("click", () => openCollectionFilter("trade", "trade"));
  }

  function activate() {
    void render();
  }

  window.CardDexInsightsUI = Object.freeze({
    init,
    activate,
    render
  });
})();
