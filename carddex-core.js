"use strict";

(() => {
  const VERSION = "6.13";
  const EVENT_PREFIX = "carddex:";
  const CARDMARKET_SEARCH = "https://www.cardmarket.com/de/Pokemon/Products/Search";

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`${EVENT_PREFIX}${name}`, { detail }));
  }

  function on(name, listener, options) {
    const eventName = `${EVENT_PREFIX}${name}`;
    window.addEventListener(eventName, listener, options);
    return () => window.removeEventListener(eventName, listener, options);
  }

  function normalizeImageBase(value) {
    return String(value || "")
      .replace(/\/(?:low|high)\.(?:webp|png|jpe?g)$/i, "")
      .replace(/\/$/, "");
  }

  function isDirectImageUrl(value) {
    return /^https?:\/\/[^?#]+\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(String(value || ""));
  }

  function resolveCardImage(card, quality = "low") {
    if (card?.scanImage && String(card.scanImage).startsWith("data:image/")) return card.scanImage;
    const image = String(card?.image || "").trim();
    if ((card?.directImage || card?._directImage || isDirectImageUrl(image)) && /^https?:\/\//i.test(image)) return image;
    const base = normalizeImageBase(image);
    return /^https?:\/\//i.test(base) ? `${base}/${quality}.webp` : "icons/card-placeholder.svg";
  }

  function buildCardmarketSearchUrl(query) {
    const params = new URLSearchParams({ searchString: String(query || "").trim() });
    return `${CARDMARKET_SEARCH}?${params.toString()}`;
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "–";
    return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function localDayKey(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  window.CardDexCore = Object.freeze({
    version: VERSION,
    emit,
    on,
    normalizeImageBase,
    isDirectImageUrl,
    resolveCardImage,
    buildCardmarketSearchUrl,
    formatDateTime,
    formatTime,
    localDayKey,
    escapeHtml
  });
})();
