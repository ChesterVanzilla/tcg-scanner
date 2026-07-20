"use strict";

const API_BASE = "https://api.tcgdex.net/v2";
const CARDMARKET_BASE = "https://www.cardmarket.com/de/Pokemon/Products/Singles";
const MAX_RESULTS = 8;
const APP_VERSION = "3.0";

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
  ocrText: document.querySelector("#ocrText")
};

let selectedFile = null;
let selectedObjectUrl = null;
let ocrWorker = null;
let ocrProgressStage = {
  title: "Texterkennung läuft …",
  start: 12,
  end: 78
};

for (const input of [els.cameraInput, els.galleryInput]) {
  input.addEventListener("change", handleImageSelection);
}
els.analyzeButton.addEventListener("click", analyzeSelectedImage);
els.manualSearchButton.addEventListener("click", manualSearch);
els.language.addEventListener("change", () => {
  if (selectedFile) clearResults();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      registration.update().catch(() => {});
    } catch {
      // Die App funktioniert online auch ohne Offline-Cache.
    }
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
    const language = els.language.value === "de" ? "deu+eng" : "eng";

    setProgress("Texterkennung wird geladen …", 8);
    const worker = await getOcrWorker(language);

    const ocrSections = await recognizeCardRegions(worker, sourceImage);
    const parsed = parseOcrSections(ocrSections);

    els.ocrText.textContent = formatDebugText(ocrSections, parsed);
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

async function recognizeCardRegions(worker, image) {
  // Pokémonkarten werden auf Fotos nicht immer gleich groß aufgenommen.
  // Statt nur einen festen Kartenrahmen anzunehmen, prüfen wir mehrere
  // realistische Kartengrößen. So werden Name und Nummer auch erkannt, wenn
  // die Karte etwas weiter von der Kamera entfernt liegt.
  const cardFrames = estimateCardFrames(image);
  const titleRegions = cardFrames.map(frame => regionInsideFrame(frame, 0.08, 0.00, 0.72, 0.18));
  const numberRegions = cardFrames.map(frame => regionInsideFrame(frame, 0.03, 0.80, 0.60, 0.17));

  const titleCanvas = createMultiRegionComposite(image, titleRegions, [
    { channel: "gray", contrast: 2.0, threshold: false, invert: false },
    { binaryMode: "dark", binaryThreshold: 70 },
    { binaryMode: "dark", binaryThreshold: 105 }
  ], 1000);

  ocrProgressStage = {
    title: "Kartenname wird gelesen …",
    start: 12,
    end: 45
  };
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    tessedit_char_whitelist: "",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });
  const titleRecognition = await worker.recognize(titleCanvas);
  const titleText = titleRecognition?.data?.text || "";

  // Die Sammlernummer kann schwarz, weiß oder mit Kontur gedruckt sein.
  // Mehrere Kartenrahmen und Bildvarianten werden deshalb gemeinsam geprüft.
  const numberCanvas = createMultiRegionComposite(image, numberRegions, [
    { channel: "gray", contrast: 2.3, threshold: false, invert: false },
    { binaryMode: "dark", binaryThreshold: 85 },
    { channel: "max", contrast: 1.8, threshold: false, invert: false }
  ], 1150);

  ocrProgressStage = {
    title: "Kartennummer wird gelesen …",
    start: 46,
    end: 76
  };
  await worker.setParameters({
    tessedit_pageseg_mode: "6",
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜabcdefghijklmnopqrstuvwxyzäöü0123456789/ -",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });
  const numberRecognition = await worker.recognize(numberCanvas);
  const numberText = numberRecognition?.data?.text || "";

  const quickParsed = parseOcrSections({ titleText, numberText, fallbackText: "" });
  let fallbackText = "";
  if (!quickParsed.nameHints.length) {
    const fallbackRegions = cardFrames.map(frame => regionInsideFrame(frame, 0.04, 0.00, 0.90, 0.27));
    const fallbackCanvas = createMultiRegionComposite(image, fallbackRegions, [
      { channel: "gray", contrast: 2.0, threshold: false, invert: false },
      { binaryMode: "dark", binaryThreshold: 80 }
    ], 1050);

    ocrProgressStage = {
      title: "Zusätzlicher Kartenbereich wird geprüft …",
      start: 77,
      end: 81
    };
    await worker.setParameters({
      tessedit_pageseg_mode: "6",
      tessedit_char_whitelist: "",
      preserve_interword_spaces: "1",
      user_defined_dpi: "300"
    });
    const fallbackRecognition = await worker.recognize(fallbackCanvas);
    fallbackText = fallbackRecognition?.data?.text || "";
  }

  return { titleText, numberText, fallbackText };
}

function estimateCardFrames(image) {
  return [0.72, 0.83, 0.94].map(scale => estimateCardFrame(image, scale));
}

function estimateCardFrame(image, scale = 0.94) {
  const cardRatio = 2.5 / 3.5;
  let height = image.naturalHeight * scale;
  let width = height * cardRatio;

  if (width > image.naturalWidth * 0.98) {
    width = image.naturalWidth * 0.98;
    height = width / cardRatio;
  }

  return {
    x: (image.naturalWidth - width) / 2,
    y: (image.naturalHeight - height) / 2,
    width,
    height,
    imageWidth: image.naturalWidth,
    imageHeight: image.naturalHeight
  };
}

function regionInsideFrame(frame, x, y, width, height) {
  return {
    x: (frame.x + frame.width * x) / frame.imageWidth,
    y: (frame.y + frame.height * y) / frame.imageHeight,
    width: (frame.width * width) / frame.imageWidth,
    height: (frame.height * height) / frame.imageHeight
  };
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
        const range = ocrProgressStage.end - ocrProgressStage.start;
        const percent = ocrProgressStage.start + Math.round((message.progress || 0) * range);
        setProgress(ocrProgressStage.title, percent);
      }
    }
  });

  ocrWorker = { language, worker };
  return worker;
}

function createMultiRegionComposite(image, regions, variants, targetWidth) {
  const processed = [];
  for (const region of regions) {
    for (const variant of variants) {
      processed.push(createProcessedRegion(image, region, variant, targetWidth));
    }
  }

  const gap = 18;
  const padding = 26;
  const width = Math.max(...processed.map(canvas => canvas.width)) + padding * 2;
  const height = processed.reduce((sum, canvas) => sum + canvas.height, 0)
    + gap * Math.max(0, processed.length - 1)
    + padding * 2;

  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  let y = padding;
  for (const canvas of processed) {
    ctx.drawImage(canvas, padding, y);
    y += canvas.height + gap;
  }
  return composite;
}

function createRegionComposite(image, region, variants, targetWidth) {
  const processed = variants.map(variant => createProcessedRegion(image, region, variant, targetWidth));
  const gap = 28;
  const padding = 34;
  const width = Math.max(...processed.map(canvas => canvas.width)) + padding * 2;
  const height = processed.reduce((sum, canvas) => sum + canvas.height, 0)
    + gap * Math.max(0, processed.length - 1)
    + padding * 2;

  const composite = document.createElement("canvas");
  composite.width = width;
  composite.height = height;
  const ctx = composite.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);

  let y = padding;
  for (const canvas of processed) {
    ctx.drawImage(canvas, padding, y);
    y += canvas.height + gap;
  }
  return composite;
}

function createProcessedRegion(image, region, variant, targetWidth) {
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * region.width));
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * region.height));
  const width = Math.max(900, Math.min(targetWidth, Math.round(sourceWidth * 3.1)));
  const height = Math.max(120, Math.round(sourceHeight * (width / sourceWidth)));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    Math.round(image.naturalWidth * region.x),
    Math.round(image.naturalHeight * region.y),
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height
  );

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const grayValues = new Uint8Array(width * height);

  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];

    if (variant.binaryMode === "dark") {
      // Dunkle Schrift wird schwarz, der farbige Hintergrund weiß.
      grayValues[pixel] = Math.max(red, green, blue) < variant.binaryThreshold ? 0 : 255;
      continue;
    }
    if (variant.binaryMode === "light") {
      // Helle Schrift wird schwarz, der farbige Hintergrund weiß.
      grayValues[pixel] = Math.min(red, green, blue) > variant.binaryThreshold ? 0 : 255;
      continue;
    }

    let gray = variant.channel === "max"
      ? Math.max(red, green, blue)
      : Math.round(0.299 * red + 0.587 * green + 0.114 * blue);

    gray = Math.max(0, Math.min(255, (gray - 128) * (variant.contrast || 1) + 128));
    if (variant.invert) gray = 255 - gray;
    grayValues[pixel] = gray;
  }

  const threshold = variant.threshold ? otsuThreshold(grayValues) : null;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const gray = threshold === null ? grayValues[pixel] : (grayValues[pixel] >= threshold ? 255 : 0);
    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
    pixels[index + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function otsuThreshold(values) {
  const histogram = new Uint32Array(256);
  for (const value of values) histogram[value] += 1;

  const total = values.length;
  let sum = 0;
  for (let index = 0; index < 256; index += 1) sum += index * histogram[index];

  let sumBackground = 0;
  let weightBackground = 0;
  let maximumVariance = 0;
  let threshold = 128;

  for (let index = 0; index < 256; index += 1) {
    weightBackground += histogram[index];
    if (!weightBackground) continue;
    const weightForeground = total - weightBackground;
    if (!weightForeground) break;

    sumBackground += index * histogram[index];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = index;
    }
  }
  return threshold;
}

function parseOcrSections({ titleText = "", numberText = "", fallbackText = "" }) {
  const nameHints = extractNameHints([titleText, fallbackText].filter(Boolean).join("\n"));
  const numbers = extractCollectorNumbers([numberText, fallbackText].filter(Boolean).join("\n"));
  const rawText = [titleText, numberText, fallbackText].filter(Boolean).join("\n");

  return {
    rawText,
    normalizedText: normalizeText(rawText),
    numbers,
    nameHints
  };
}

function extractNameHints(text) {
  const rejectPatterns = [
    /entwickelt\s+sich\s+aus/i,
    /\bentw[a-zäöüß]{2,12}lt\b.*\baus\b/i,
    /evolves?\s+from/i,
    /entwicklung/i,
    /weakness|resistance|retreat|damage|ability/i,
    /schw[aä]che|resistenz|r[uü]ckzug|f[aä]higkeit|schaden/i,
    /illustrator|illustration|copyright|pokemon\/nintendo/i,
    /wirf|lege|deines\s+gegners|dein\s+gegner|angriff/i,
    /attack|during|opponent|energy|energie/i
  ];

  const stopWords = new Set([
    "basic", "basis", "stage", "phase", "pokemon", "pokémon", "trainer", "energy", "energie",
    "ability", "fähigkeit", "attack", "schaden", "damage", "weakness", "resistance", "retreat",
    "schwäche", "resistenz", "rückzug", "illus", "illustrator", "copyright", "level", "item",
    "unterstützer", "supporter", "stadium", "regel", "rule", "hp", "kp"
  ]);

  const candidates = text
    .split(/\r?\n/)
    .map(cleanOcrLine)
    .filter(Boolean)
    .filter(line => !rejectPatterns.some(pattern => pattern.test(line)))
    .map(line => line
      .replace(/\b(?:PHASE|STAGE)\s*[12I]\b/gi, " ")
      .replace(/\b(?:BASIC|BASIS)\b/gi, " ")
      .replace(/\b(?:HP|KP)\s*[0-9O]{1,3}\b/gi, " ")
      .replace(/\b[0-9O]{2,3}\s*(?:HP|KP)\b/gi, " ")
      .replace(/\b(?:MEG|SVP|SWSH|SM|XY|BW)\s*(?:DE|EN)?\b/gi, " ")
      .replace(/[0-9/\\()[\]{}<>©®™_*+=:;,.!?]/g, " ")
      .replace(/[^A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\- ]/g, " ")
      .replace(/^(?:[A-Za-zÄÖÜäöüß]\s+)+/, "")
      .replace(/(?:\s+[A-Za-zÄÖÜäöüß])+$/, "")
      .replace(/\s+/g, " ")
      .trim())
    .filter(line => line.length >= 3 && line.length <= 34)
    .filter(line => {
      const words = normalizeText(line).split(" ").filter(Boolean);
      if (!words.length || words.length > 5) return false;
      const usefulWords = words.filter(word => word.length >= 3 && !stopWords.has(word));
      return usefulWords.length >= 1;
    })
    .map(line => ({ line, score: scoreNameHint(line) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.line)
    .filter((line, index, array) => array.findIndex(other => normalizeText(other) === normalizeText(line)) === index);

  return candidates.slice(0, 6);
}

function scoreNameHint(line) {
  const words = line.split(/\s+/).filter(Boolean);
  let score = 40;
  if (words.length === 1) score += 35;
  if (words.length === 2) score += 22;
  if (words.length > 3) score -= 12 * (words.length - 3);
  if (/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\-]+(?:\s+[A-ZÄÖÜ0-9][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ0-9'\-]+)*$/.test(line)) score += 16;
  score += Math.min(20, line.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length);
  return score;
}

function extractCollectorNumbers(text) {
  const scoredNumbers = new Map();
  const lines = text
    .split(/\r?\n/)
    .map(line => line.toUpperCase().replace(/[|\\]/g, "/").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const addNumber = (value, score) => {
    const normalized = normalizeCollectorNumber(value);
    if (!normalized) return;
    const current = scoredNumbers.get(normalized) || 0;
    if (score > current) scoredNumbers.set(normalized, score);
  };

  for (const line of lines) {
    const slashPattern = /(?:^|\s)([0-9O]{1,3})\s*[\/IL]\s*([0-9O]{2,3})(?=\s|$|[^0-9A-Z])/g;
    for (const match of line.matchAll(slashPattern)) {
      const numerator = match[1].replace(/O/g, "0");
      const denominator = match[2].replace(/O/g, "0");
      const numeratorValue = Number(numerator);
      const denominatorValue = Number(denominator);
      if (Number.isFinite(numeratorValue) && Number.isFinite(denominatorValue)
        && denominatorValue >= 10 && numeratorValue <= denominatorValue) {
        addNumber(numerator, 100);
      }
    }
  }

  // Der Schrägstrich wird von OCR häufig komplett verschluckt, zum Beispiel
  // "030 132" statt "030/132". Solche plausiblen Zahlenpaare werden ebenfalls
  // als Sammlernummer ausgewertet.
  const spacedPairPattern = /(?:^|[^0-9O])([0-9O]{1,3})\s+([0-9O]{2,3})(?=$|[^0-9O])/g;
  for (const line of lines) {
    for (const match of line.matchAll(spacedPairPattern)) {
      const numerator = match[1].replace(/O/g, "0");
      const denominator = match[2].replace(/O/g, "0");
      const numeratorValue = Number(numerator);
      const denominatorValue = Number(denominator);
      if (!Number.isFinite(numeratorValue) || !Number.isFinite(denominatorValue)) continue;
      if (denominatorValue < 20 || denominatorValue > 400 || numeratorValue < 1 || numeratorValue > denominatorValue) continue;
      if (numeratorValue < 10 && !numerator.startsWith("0")) continue;
      let score = 72;
      if (numerator.startsWith("0")) score += 14;
      if (denominatorValue >= 100) score += 6;
      addNumber(numerator, score);
    }
  }

  const promoPattern = /\b(?:SVP|SWSH|SM|XY|BW)\s*(?:EN|DE)?\s*[- ]?\s*([0-9O]{1,3})\b/g;
  const setLinePattern = /\b[A-Z]{2,5}\s+(?:DE|EN|FR|IT|ES|PT)\s+([0-9O]{2,3})\b/g;
  for (const line of lines) {
    for (const match of line.matchAll(promoPattern)) addNumber(match[1].replace(/O/g, "0"), 90);
    for (const match of line.matchAll(setLinePattern)) addNumber(match[1].replace(/O/g, "0"), 80);
  }

  // Bei weiß umrandeten Kartennummern liest OCR den Schrägstrich gelegentlich
  // als 1 oder 7 und hängt Ziffern zusammen, z. B. "0307132". Wir prüfen
  // deshalb nur plausible 2-/3-stellige Nummern mit einem 2-/3-stelligen Settotal.
  for (const line of lines) {
    const digitGroups = line.replace(/O/g, "0").match(/\d{6,12}/g) || [];
    for (const group of digitGroups) {
      for (let start = 0; start < group.length; start += 1) {
        for (const numeratorLength of [3, 2]) {
          for (const separatorLength of [1, 0, 2]) {
            for (const denominatorLength of [3, 2]) {
              const end = start + numeratorLength + separatorLength + denominatorLength;
              if (end > group.length) continue;
              const numerator = group.slice(start, start + numeratorLength);
              const separator = group.slice(start + numeratorLength, start + numeratorLength + separatorLength);
              const denominator = group.slice(start + numeratorLength + separatorLength, end);
              if (separatorLength && !/^[17]+$/.test(separator)) continue;

              const numeratorValue = Number(numerator);
              const denominatorValue = Number(denominator);
              if (numeratorValue < 1 || denominatorValue < 20 || denominatorValue > 300 || numeratorValue > denominatorValue) continue;

              let score = 45;
              if (numerator.startsWith("0")) score += 18;
              if (separatorLength === 1) score += 10;
              if (denominatorLength === 3) score += 5;
              addNumber(numerator, score);
            }
          }
        }
      }
    }
  }

  return [...scoredNumbers.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([number]) => number)
    .slice(0, 4);
}

function cleanOcrLine(line) {
  return String(line || "")
    .replace(/[|©®™]/g, " ")
    .replace(/[“”„]/g, '"')
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDebugText(ocrSections, parsed) {
  const recognizedName = parsed.nameHints[0] || "nicht sicher erkannt";
  const recognizedNumber = parsed.numbers[0] || "nicht sicher erkannt";
  const blocks = [
    `CardScan CM v${APP_VERSION}`,
    `Ermittelter Kartenname: ${recognizedName}`,
    `Ermittelte Kartennummer: ${recognizedNumber}`,
    "",
    "--- Namensbereich ---",
    ocrSections.titleText.trim() || "Kein Text erkannt.",
    "",
    "--- Nummernbereich ---",
    ocrSections.numberText.trim() || "Kein Text erkannt."
  ];

  if (ocrSections.fallbackText.trim()) {
    blocks.push("", "--- Zusätzlicher Bereich ---", ocrSections.fallbackText.trim());
  }
  return blocks.join("\n");
}

async function findCandidates(parsed, language) {
  const candidateMap = new Map();
  const tasks = [];

  for (const number of parsed.numbers.slice(0, 3)) {
    for (const variant of numberVariants(number)) {
      tasks.push(fetchCards(language, { localId: `eq:${variant}` }, 220));
    }
  }

  for (const hint of parsed.nameHints.slice(0, 4)) {
    for (const variant of nameSearchVariants(hint)) {
      tasks.push(fetchCards(language, { name: variant }, 100));
    }
  }

  if (!tasks.length) return [];
  const responses = await Promise.allSettled(tasks);
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const card of response.value) candidateMap.set(card.id, card);
  }
  return [...candidateMap.values()];
}

function nameSearchVariants(name) {
  const clean = String(name || "").trim();
  if (clean.length < 3) return [];
  const variants = new Set([clean]);
  if (clean.length >= 7) {
    variants.add(clean.slice(0, -1));
    variants.add(clean.slice(1));
  }
  const longestWord = clean.split(/\s+/).sort((a, b) => b.length - a.length)[0];
  if (longestWord?.length >= 4) variants.add(longestWord);
  return [...variants].filter(value => value.length >= 3).slice(0, 4);
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
    .slice(0, 18);

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

  if (cardName && ocr.includes(cardName)) score += 140;
  if (card.localId && parsed.numbers.some(number => collectorNumbersEqual(number, card.localId))) score += 100;

  const hints = parsed.nameHints.map(normalizeText);
  for (const hint of hints) {
    score = Math.max(score, Math.round(similarity(cardName, hint) * 100));
    score += Math.round(tokenOverlap(cardName, hint) * 40);
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
    const recognized = [
      parsed.nameHints[0] ? `Name „${parsed.nameHints[0]}“` : "",
      parsed.numbers[0] ? `Nummer ${parsed.numbers[0]}` : ""
    ].filter(Boolean).join(" und ");

    els.resultMessage.className = "notice error";
    els.resultMessage.textContent = recognized
      ? `Keine passende Karte zu ${recognized} gefunden. Prüfe die erkannten Angaben oder nutze die manuelle Suche.`
      : "Keine passende Karte gefunden. Trage den Namen und möglichst die Kartennummer in die manuelle Suche ein.";
    els.resultMessage.classList.remove("hidden");
    els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const recognizedParts = [];
  if (parsed.nameHints[0]) recognizedParts.push(parsed.nameHints[0]);
  if (parsed.numbers[0]) recognizedParts.push(`Nr. ${parsed.numbers[0]}`);

  if (recognizedParts.length) {
    els.resultMessage.className = "notice";
    els.resultMessage.textContent = `Erkannt: ${recognizedParts.join(" · ")}. Bitte vergleiche zur Sicherheit Kartenbild und Set.`;
    els.resultMessage.classList.remove("hidden");
  } else if (!parsed.numbers.length) {
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
  // Cardmarket behandelt mehrere Suchwörter als starke Eingrenzung. Der
  // übersetzte Setname aus TCGdex kann dort anders heißen und führte deshalb
  // teilweise zu null Treffern. Name + Sammlernummer ist deutlich robuster.
  const number = normalizeCollectorNumber(card.localId || "");
  const queryParts = [card.name, number].filter(Boolean);
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
    .replace(/O/g, "0")
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
