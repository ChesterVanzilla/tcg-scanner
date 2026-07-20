"use strict";

const API_BASE = "https://api.tcgdex.net/v2";
const CARDMARKET_BASE = "https://www.cardmarket.com/de/Pokemon/Products/Search";
const MAX_RESULTS = 8;

const els = {
  cameraInput: document.querySelector("#cameraInput"),
  galleryInput: document.querySelector("#galleryInput"),
  language: document.querySelector("#language"),
  previewWrap: document.querySelector("#previewWrap"),
  previewImage: document.querySelector("#previewImage"),
  analyzeButton: document.querySelector("#analyzeButton"),
  progressPanel: document.querySelector("#progressPanel"),
  progressTitle: document.querySelector("#progressTitle"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  resultPanel: document.querySelector("#resultPanel"),
  resultMessage: document.querySelector("#resultMessage"),
  results: document.querySelector("#results"),
  manualName: document.querySelector("#manualName"),
  manualNumber: document.querySelector("#manualNumber"),
  manualSearchButton: document.querySelector("#manualSearchButton"),
  debugPanel: document.querySelector("#debugPanel"),
  ocrText: document.querySelector("#ocrText"),
  workCanvas: document.querySelector("#workCanvas")
};

let selectedFile = null;
let selectedObjectUrl = null;
let ocrWorker = null;

for (const input of [els.cameraInput, els.galleryInput]) {
  input.addEventListener("change", handleImageSelection);
}
els.analyzeButton.addEventListener("click", analyzeSelectedImage);
els.manualSearchButton.addEventListener("click", manualSearch);
els.language.addEventListener("change", () => {
  if (selectedFile) clearResults();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // Die App funktioniert auch ohne Offline-Cache.
    });
  });
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  selectedFile = file;
  if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
  selectedObjectUrl = URL.createObjectURL(file);
  els.previewImage.src = selectedObjectUrl;
  els.previewWrap.classList.remove("hidden");
  clearResults();
  els.previewWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearResults() {
  els.resultPanel.classList.add("hidden");
  els.debugPanel.classList.add("hidden");
  els.results.innerHTML = "";
  els.resultMessage.className = "notice hidden";
  els.resultMessage.textContent = "";
}

async function analyzeSelectedImage() {
  if (!selectedFile) return;
  setBusy(true);
  clearResults();

  try {
    setProgress("Bild wird vorbereitet …", 4);
    const sourceImage = await loadImage(selectedObjectUrl);
    const preparedImage = prepareOcrComposite(sourceImage);

    const language = els.language.value === "de" ? "deu+eng" : "eng";
    setProgress("Texterkennung wird geladen …", 8);
    const worker = await getOcrWorker(language);

    setProgress("Name und Kartennummer werden gelesen …", 12);
    const recognition = await worker.recognize(preparedImage);
    const rawText = recognition?.data?.text || "";
    const parsed = parseOcrText(rawText);

    els.ocrText.textContent = rawText.trim() || "Kein Text erkannt.";
    els.debugPanel.classList.remove("hidden");
    els.manualNumber.value = parsed.numbers[0] || "";
    els.manualName.value = parsed.nameHints[0] || "";

    setProgress("Kartendatenbank wird durchsucht …", 82);
    const candidates = await findCandidates(parsed, els.language.value);
    setProgress("Treffer werden sortiert …", 96);
    const ranked = await rankAndEnrichCandidates(candidates, parsed, els.language.value);

    renderResults(ranked, parsed);
    setProgress("Fertig", 100);
  } catch (error) {
    console.error(error);
    showError(
      "Die automatische Erkennung konnte nicht abgeschlossen werden. Prüfe deine Internetverbindung oder nutze unten die manuelle Suche."
    );
  } finally {
    setTimeout(() => setBusy(false), 250);
  }
}

async function manualSearch() {
  const name = els.manualName.value.trim();
  const number = normalizeCollectorNumber(els.manualNumber.value);
  if (!name && !number) {
    showError("Bitte gib mindestens einen Kartennamen oder eine Kartennummer ein.");
    return;
  }

  setBusy(true);
  clearResults();
  try {
    const parsed = {
      rawText: `${name}\n${number}`,
      normalizedText: normalizeText(`${name} ${number}`),
      numbers: number ? [number] : [],
      nameHints: name ? [name] : []
    };
    setProgress("Kartendatenbank wird durchsucht …", 35);
    const candidates = await findCandidates(parsed, els.language.value);
    setProgress("Treffer werden sortiert …", 75);
    const ranked = await rankAndEnrichCandidates(candidates, parsed, els.language.value);
    renderResults(ranked, parsed);
    setProgress("Fertig", 100);
  } catch (error) {
    console.error(error);
    showError("Die Kartensuche ist gerade nicht erreichbar. Bitte versuche es erneut.");
  } finally {
    setTimeout(() => setBusy(false), 250);
  }
}

async function getOcrWorker(language) {
  if (ocrWorker?.language === language) return ocrWorker.worker;
  if (ocrWorker?.worker) await ocrWorker.worker.terminate();

  const worker = await Tesseract.createWorker(language, 1, {
    logger: message => {
      if (message.status === "recognizing text") {
        const percent = Math.max(12, Math.min(78, 12 + Math.round((message.progress || 0) * 66)));
        setProgress("Name und Kartennummer werden gelesen …", percent);
      }
    }
  });
  await worker.setParameters({
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });
  ocrWorker = { language, worker };
  return worker;
}

function prepareOcrComposite(image) {
  const canvas = els.workCanvas;
  const maxWidth = 1500;
  const scale = Math.min(2.2, maxWidth / image.naturalWidth);
  const width = Math.max(800, Math.round(image.naturalWidth * scale));
  const height = Math.round(image.naturalHeight * scale);

  const topHeight = Math.round(height * 0.32);
  const bottomStart = Math.round(height * 0.68);
  const bottomHeight = height - bottomStart;
  const gap = 30;
  canvas.width = width;
  canvas.height = topHeight + bottomHeight + gap;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight * 0.32, 0, 0, width, topHeight);
  ctx.drawImage(
    image,
    0,
    image.naturalHeight * 0.68,
    image.naturalWidth,
    image.naturalHeight * 0.32,
    0,
    topHeight + gap,
    width,
    bottomHeight
  );

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.55 + 128));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = contrasted;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function parseOcrText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.replace(/[|©®™]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const numbers = [];
  const joined = lines.join(" ");
  const slashPattern = /\b([A-Z]{0,5}\s*[- ]?\s*\d{1,3})\s*[\/]\s*(\d{1,3})\b/gi;
  const promoPattern = /\b(?:SVP|SWSH|SM|XY|BW)\s*(?:EN|DE)?\s*[- ]?\s*(\d{1,3})\b/gi;

  for (const match of joined.matchAll(slashPattern)) {
    const normalized = normalizeCollectorNumber(match[1]);
    if (normalized && !numbers.includes(normalized)) numbers.push(normalized);
  }
  for (const match of joined.matchAll(promoPattern)) {
    const normalized = normalizeCollectorNumber(match[1]);
    if (normalized && !numbers.includes(normalized)) numbers.push(normalized);
  }

  // Fallback: typische Nummernzeile im unteren Kartenbereich.
  if (!numbers.length) {
    for (const line of lines.slice(-8)) {
      const match = line.match(/(?:^|\s)([A-Z]{0,3}\d{1,3}|\d{2,3})(?:\s|$)/i);
      if (match) {
        const normalized = normalizeCollectorNumber(match[1]);
        if (normalized && !numbers.includes(normalized)) numbers.push(normalized);
      }
    }
  }

  const stopWords = new Set([
    "basic", "stage", "phase", "basis", "pokemon", "pokémon", "trainer", "energy", "energie",
    "ability", "fähigkeit", "attack", "schaden", "damage", "weakness", "resistance", "retreat",
    "schwäche", "resistenz", "rückzug", "illus", "illustrator", "copyright", "level", "item",
    "unterstützer", "supporter", "stadium", "regel", "rule", "hp", "kp", "ex", "gx", "vmax", "vstar"
  ]);

  const nameHints = lines
    .slice(0, Math.max(5, Math.ceil(lines.length * 0.5)))
    .map(line => line
      .replace(/\b(?:HP|KP)\s*\d{1,3}\b/gi, "")
      .replace(/\b(?:BASIC|BASIS|STAGE\s*\d|PHASE\s*\d)\b/gi, "")
      .replace(/[0-9/\\()[\]{}<>©®™_*+=:;,.!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .filter(line => line.length >= 3 && line.length <= 34)
    .filter(line => {
      const words = normalizeText(line).split(" ").filter(Boolean);
      return words.some(word => word.length >= 3 && !stopWords.has(word));
    })
    .filter((line, index, array) => array.findIndex(other => normalizeText(other) === normalizeText(line)) === index)
    .slice(0, 6);

  return {
    rawText,
    normalizedText: normalizeText(rawText),
    numbers,
    nameHints
  };
}

async function findCandidates(parsed, language) {
  const candidateMap = new Map();
  const tasks = [];

  for (const number of parsed.numbers.slice(0, 3)) {
    for (const variant of numberVariants(number)) {
      tasks.push(fetchCards(language, { localId: `eq:${variant}` }, 180));
    }
  }

  for (const hint of parsed.nameHints.slice(0, 4)) {
    const cleanHint = hint.replace(/\b(?:ex|gx|v|vmax|vstar)\b/gi, "").trim();
    if (cleanHint.length >= 3) tasks.push(fetchCards(language, { name: cleanHint }, 90));
  }

  if (!tasks.length) return [];
  const responses = await Promise.allSettled(tasks);
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const card of response.value) candidateMap.set(card.id, card);
  }
  return [...candidateMap.values()];
}

async function fetchCards(language, filters, limit = 100) {
  const params = new URLSearchParams(filters);
  params.set("pagination:page", "1");
  params.set("pagination:itemsPerPage", String(limit));
  const response = await fetch(`${API_BASE}/${language}/cards?${params.toString()}`);
  if (!response.ok) throw new Error(`TCGdex-Suche fehlgeschlagen: ${response.status}`);
  const json = await response.json();
  return Array.isArray(json) ? json : [];
}

async function rankAndEnrichCandidates(candidates, parsed, language) {
  const prelim = candidates
    .map(card => ({ ...card, _score: scoreCard(card, parsed) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 16);

  const enriched = await Promise.all(prelim.map(async card => {
    try {
      const response = await fetch(`${API_BASE}/${language}/cards/${encodeURIComponent(card.id)}`);
      if (!response.ok) return card;
      const full = await response.json();
      return { ...card, ...full, _score: scoreCard({ ...card, ...full }, parsed) };
    } catch {
      return card;
    }
  }));

  return enriched
    .sort((a, b) => b._score - a._score)
    .slice(0, MAX_RESULTS);
}

function scoreCard(card, parsed) {
  const cardName = normalizeText(card.name || "");
  const ocr = parsed.normalizedText;
  let score = 0;

  if (cardName && ocr.includes(cardName)) score += 120;
  if (card.localId && parsed.numbers.some(number => collectorNumbersEqual(number, card.localId))) score += 90;

  const hints = parsed.nameHints.map(normalizeText);
  for (const hint of hints) {
    score = Math.max(score, Math.round(similarity(cardName, hint) * 85));
    const overlap = tokenOverlap(cardName, hint);
    score += Math.round(overlap * 35);
  }

  const setName = normalizeText(card.set?.name || "");
  if (setName && setName.length > 2 && ocr.includes(setName)) score += 28;
  if (card.rarity && ocr.includes(normalizeText(card.rarity))) score += 8;
  return score;
}

function renderResults(cards, parsed) {
  els.resultPanel.classList.remove("hidden");
  els.results.innerHTML = "";

  if (!cards.length) {
    els.resultMessage.className = "notice error";
    els.resultMessage.textContent = "Keine passende Karte gefunden. Trage den Namen und möglichst die Kartennummer in die manuelle Suche ein.";
    els.resultMessage.classList.remove("hidden");
    els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (!parsed.numbers.length) {
    els.resultMessage.className = "notice";
    els.resultMessage.textContent = "Die Kartennummer wurde nicht sicher gelesen. Vergleiche deshalb besonders das Kartenbild und das Set.";
    els.resultMessage.classList.remove("hidden");
  }

  for (const card of cards) {
    const article = document.createElement("article");
    article.className = "result-card";

    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = `${card.name || "Pokémon-Karte"} – Kartenabbildung`;
    image.src = card.image ? `${card.image}/low.webp` : "icons/card-placeholder.svg";
    image.onerror = () => { image.src = "icons/card-placeholder.svg"; };

    const info = document.createElement("div");
    info.className = "result-info";

    const title = document.createElement("h3");
    title.textContent = card.name || "Unbekannte Karte";

    const meta = document.createElement("p");
    meta.className = "result-meta";
    const setName = card.set?.name || "Set nicht angegeben";
    const number = card.localId || "–";
    const officialTotal = card.set?.cardCount?.official;
    meta.innerHTML = `${escapeHtml(setName)}<br><span class="result-number">Nr. ${escapeHtml(String(number))}${officialTotal ? `/${escapeHtml(String(officialTotal))}` : ""}</span>`;

    const link = document.createElement("a");
    link.className = "cardmarket-button";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Auf Cardmarket öffnen";
    link.href = buildCardmarketUrl(card);

    info.append(title, meta, link);
    article.append(image, info);
    els.results.append(article);
  }

  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildCardmarketUrl(card) {
  const queryParts = [card.name, card.set?.name, card.localId].filter(Boolean);
  const params = new URLSearchParams({ searchString: queryParts.join(" ") });
  return `${CARDMARKET_BASE}?${params.toString()}`;
}

function showError(message) {
  els.resultPanel.classList.remove("hidden");
  els.resultMessage.className = "notice error";
  els.resultMessage.textContent = message;
  els.resultMessage.classList.remove("hidden");
  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setBusy(isBusy) {
  els.progressPanel.classList.toggle("hidden", !isBusy);
  els.analyzeButton.disabled = isBusy;
  els.manualSearchButton.disabled = isBusy;
  els.cameraInput.disabled = isBusy;
  els.galleryInput.disabled = isBusy;
  if (!isBusy) setProgress("", 0);
}

function setProgress(title, percent) {
  els.progressTitle.textContent = title;
  els.progressText.textContent = `${Math.round(percent)} %`;
  els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = src;
  });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\-'. ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCollectorNumber(value) {
  const cleaned = String(value || "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9]/g, "");
  const match = cleaned.match(/([A-Z]*)(\d{1,3})$/);
  return match ? `${match[1]}${match[2]}` : "";
}

function numberVariants(number) {
  const normalized = normalizeCollectorNumber(number);
  const match = normalized.match(/^([A-Z]*)(\d{1,3})$/);
  if (!match) return [];
  const [, prefix, digits] = match;
  const variants = new Set([normalized, `${prefix}${Number(digits)}`]);
  if (!prefix) variants.add(digits.padStart(3, "0"));
  return [...variants].filter(Boolean);
}

function collectorNumbersEqual(a, b) {
  const na = normalizeCollectorNumber(a);
  const nb = normalizeCollectorNumber(b);
  if (na === nb) return true;
  const ma = na.match(/^([A-Z]*)(\d+)$/);
  const mb = nb.match(/^([A-Z]*)(\d+)$/);
  return Boolean(ma && mb && ma[1] === mb[1] && Number(ma[2]) === Number(mb[2]));
}

function tokenOverlap(a, b) {
  const setA = new Set(a.split(" ").filter(token => token.length > 1));
  const setB = new Set(b.split(" ").filter(token => token.length > 1));
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const token of setA) if (setB.has(token)) common += 1;
  return common / Math.max(setA.size, setB.size);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.15;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, row) => [row]);
  for (let column = 0; column <= a.length; column += 1) matrix[0][column] = column;
  for (let row = 1; row <= b.length; row += 1) {
    for (let column = 1; column <= a.length; column += 1) {
      matrix[row][column] = b[row - 1] === a[column - 1]
        ? matrix[row - 1][column - 1]
        : Math.min(matrix[row - 1][column - 1] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column] + 1);
    }
  }
  return matrix[b.length][a.length];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
