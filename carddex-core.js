"use strict";

(() => {
  const VERSION = "6.14";
  const EVENT_PREFIX = "carddex:";
  const CARDMARKET_SEARCH = "https://www.cardmarket.com/de/Pokemon/Products/Search";
  const CARDMARKET_PRODUCT = "https://www.cardmarket.com/de/Pokemon/Products";
  const TCGDEX_API_BASE = "https://api.tcgdex.net/v2";
  const PRODUCT_CACHE_KEY = "carddex-v614-cardmarket-products";
  const PRODUCT_CACHE_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

  const KNOWN_CARDMARKET_SET_CODES = Object.freeze({
    "swsh9.5tg": "BRS",
    "swsh10.5tg": "ASR",
    "swsh11.5tg": "LOR",
    "swsh12.5tg": "SIT",
    "me01": "MEG",
    "me02": "PFL",
    "me2.5": "ASC",
    "me02.5": "ASC",
    "me2pt5": "ASC",
    "me02pt5": "ASC",
    "sv3.5": "MEW",
    "sv3pt5": "MEW"
  });

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

  function normalizeCardmarketProductId(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const number = Number(digits);
    return Number.isSafeInteger(number) && number > 0 ? String(number) : "";
  }

  function buildCardmarketProductUrl(productId, locale = "de") {
    const id = normalizeCardmarketProductId(productId);
    if (!id) return "";
    const language = locale === "en" ? "en" : "de";
    return `https://www.cardmarket.com/${language}/Pokemon/Products?idProduct=${encodeURIComponent(id)}`;
  }

  function normalizeCardmarketUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return "";
      const host = parsed.hostname.toLowerCase();
      if (host !== "cardmarket.com" && host !== "www.cardmarket.com") return "";
      if (!/^\/(?:de|en)\/Pokemon\/Products(?:\/Singles\/|$)/i.test(parsed.pathname)) return "";
      if (/\/Pokemon\/Products$/i.test(parsed.pathname) && !normalizeCardmarketProductId(parsed.searchParams.get("idProduct"))) return "";
      return parsed.href;
    } catch {
      return "";
    }
  }

  function extractCardmarketProductId(card) {
    const direct = normalizeCardmarketProductId(
      card?.cardmarketProductId ||
      card?.thirdParty?.cardmarket ||
      card?.pricing?.cardmarket?.productId ||
      card?._cardmarketProductId
    );
    if (direct) return direct;

    const variants = Array.isArray(card?.variants) ? card.variants : [];
    for (const variant of variants) {
      const candidate = normalizeCardmarketProductId(variant?.thirdParty?.cardmarket);
      if (candidate) return candidate;
    }

    const directUrl = normalizeCardmarketUrl(card?.cardmarketUrl || card?.pricing?.cardmarket?.url || "");
    if (directUrl) {
      try {
        return normalizeCardmarketProductId(new URL(directUrl).searchParams.get("idProduct"));
      } catch {
        return "";
      }
    }
    return "";
  }

  function getCardmarketDirectUrl(card, locale = "de") {
    const productUrl = buildCardmarketProductUrl(extractCardmarketProductId(card), locale);
    if (productUrl) return productUrl;
    return normalizeCardmarketUrl(card?.cardmarketUrl || card?.pricing?.cardmarket?.url || card?._cardmarketUrl || "");
  }

  function normalizeCardmarketSetCode(value) {
    return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function normalizeSetId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function deriveCardmarketSetCode(input) {
    const card = input || {};
    const set = card.set || card._setBrief || card;
    const candidates = [
      card.cardmarketSetCode,
      card.setCode,
      set.cardmarketSetCode,
      set.abbreviations?.official,
      set.abbreviations?.en,
      set.tcgOnline,
      set.ptcgoCode
    ];
    for (const candidate of candidates) {
      const normalized = normalizeCardmarketSetCode(candidate);
      if (normalized) return normalized;
    }
    const setId = normalizeSetId(card.setId || set.id || card._setId || "");
    return KNOWN_CARDMARKET_SET_CODES[setId] || "";
  }

  function normalizeCardmarketCardName(value) {
    return String(value || "")
      .replace(/[@©®]\s*(?=(?:ex|EX|GX|V|VMAX|VSTAR)\b)/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/-\s*(ex|EX|GX|V|VMAX|VSTAR)\b/g, " $1")
      .replace(/^Mega\s+/i, "Mega-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeCollectorNumber(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9-]/g, "");
  }

  function buildCardmarketQuery(card, options = {}) {
    const name = normalizeCardmarketCardName(
      options.name || card?.englishName || card?.name || card?.recognition?.name || ""
    );
    const setCode = normalizeCardmarketSetCode(options.setCode || deriveCardmarketSetCode(card));
    const number = normalizeCollectorNumber(options.number || card?.localId || card?.number || card?.recognition?.number || "");
    const parts = [];
    if (name) parts.push(name);
    if (setCode && !number.startsWith(setCode)) parts.push(setCode);
    if (number) parts.push(number);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function buildCardmarketSearchUrl(query) {
    const params = new URLSearchParams({ searchString: String(query || "").trim() });
    return `${CARDMARKET_SEARCH}?${params.toString()}`;
  }

  function getCardmarketUrl(card, options = {}) {
    return getCardmarketDirectUrl(card, options.locale) || buildCardmarketSearchUrl(buildCardmarketQuery(card, options));
  }

  function readProductCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCT_CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeProductCache(cache) {
    try {
      localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Der Link funktioniert auch ohne lokalen Cache.
    }
  }

  async function fetchTcgdexCard(card, language = "de") {
    const id = String(card?.id || card?.cardId || "").trim();
    if (!id || /^(?:ptcg-|local-|provisional-)/i.test(id)) return null;
    const languages = [...new Set([language, card?._dataLanguage, card?.dataLanguage, "de", "en"].filter(Boolean))];
    for (const currentLanguage of languages) {
      try {
        const response = await fetch(`${TCGDEX_API_BASE}/${encodeURIComponent(currentLanguage)}/cards/${encodeURIComponent(id)}`, {
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) continue;
        const data = await response.json();
        if (data?.id) return data;
      } catch {
        // Nächste Sprache bzw. Such-Fallback verwenden.
      }
    }
    return null;
  }

  async function resolveCardmarketUrl(card, options = {}) {
    const direct = getCardmarketDirectUrl(card, options.locale);
    if (direct) return direct;

    const cardId = String(card?.id || card?.cardId || "").trim();
    if (cardId) {
      const cache = readProductCache();
      const cached = cache[cardId];
      if (cached && Date.now() - Number(cached.timestamp || 0) < PRODUCT_CACHE_MAX_AGE) {
        const cachedUrl = buildCardmarketProductUrl(cached.productId, options.locale);
        if (cachedUrl) return cachedUrl;
      }

      const fullCard = await fetchTcgdexCard(card, options.language || card?._dataLanguage || card?.dataLanguage || "de");
      const productId = extractCardmarketProductId(fullCard);
      if (productId) {
        cache[cardId] = { productId, timestamp: Date.now() };
        writeProductCache(cache);
        return buildCardmarketProductUrl(productId, options.locale);
      }
    }

    return buildCardmarketSearchUrl(buildCardmarketQuery(card, options));
  }

  function openCardmarket(card, options = {}) {
    const fallback = getCardmarketUrl(card, options);
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) {
        popup.opener = null;
        popup.document.title = "Cardmarket wird geöffnet …";
        popup.document.body.textContent = "Cardmarket wird geöffnet …";
      }
    } catch {
      popup = null;
    }

    resolveCardmarketUrl(card, options)
      .then(url => {
        if (popup && !popup.closed) popup.location.replace(url || fallback);
        else window.location.href = url || fallback;
      })
      .catch(() => {
        if (popup && !popup.closed) popup.location.replace(fallback);
        else window.location.href = fallback;
      });
    return false;
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
    normalizeCardmarketProductId,
    extractCardmarketProductId,
    buildCardmarketProductUrl,
    normalizeCardmarketUrl,
    getCardmarketDirectUrl,
    normalizeCardmarketSetCode,
    deriveCardmarketSetCode,
    normalizeCardmarketCardName,
    buildCardmarketQuery,
    buildCardmarketSearchUrl,
    getCardmarketUrl,
    resolveCardmarketUrl,
    openCardmarket,
    formatDateTime,
    formatTime,
    localDayKey,
    escapeHtml
  });
})();
