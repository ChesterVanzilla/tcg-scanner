"use strict";

const API_BASE = "https://api.tcgdex.net/v2";
const CARDMARKET_SEARCH = "https://www.cardmarket.com/de/Pokemon/Products/Search";
const OPENCV_URL = "https://docs.opencv.org/4.x/opencv.js";
const APP_VERSION = "6.6";
const AI_ENDPOINT_KEY = "cardscan-ai-endpoint";
const AI_SECRET_KEY = "cardscan-ai-secret";
const CARD_WIDTH = 750;
const CARD_HEIGHT = 1050;
const MAX_RESULTS = 8;
const SETTING_PREFIX = "carddex-v66-";
const SETTING_KEYS = {
  bootAnimation: `${SETTING_PREFIX}boot-animation`,
  rememberCamera: `${SETTING_PREFIX}remember-camera`,
  preferredCamera: `${SETTING_PREFIX}preferred-camera`,
  sleeveMode: `${SETTING_PREFIX}sleeve-mode`,
  debugMode: `${SETTING_PREFIX}debug-mode`,
  resultCount: `${SETTING_PREFIX}result-count`,
  language: `${SETTING_PREFIX}language`
};
const MAX_IMAGE_CANDIDATES = 24;
const MAX_PREPARED_CANVASES = 2;
const GALLERY_MAX_DIMENSION = 1280;

const els = {
  openScannerButton: document.querySelector("#openScannerButton"),
  cameraInput: document.querySelector("#cameraInput"),
  galleryInput: document.querySelector("#galleryInput"),
  language: document.querySelector("#language"),
  previewWrap: document.querySelector("#previewWrap"),
  previewImage: document.querySelector("#previewImage"),
  previewLabel: document.querySelector("#previewLabel"),
  cropStatus: document.querySelector("#cropStatus"),
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
  scannerModal: document.querySelector("#scannerModal"),
  closeScannerButton: document.querySelector("#closeScannerButton"),
  cameraViewport: document.querySelector("#cameraViewport"),
  cameraVideo: document.querySelector("#cameraVideo"),
  scannerGuide: document.querySelector("#scannerGuide"),
  cameraStatus: document.querySelector("#cameraStatus"),
  captureButton: document.querySelector("#captureButton"),
  shadeTop: document.querySelector(".shade-top"),
  shadeBottom: document.querySelector(".shade-bottom"),
  shadeLeft: document.querySelector(".shade-left"),
  shadeRight: document.querySelector(".shade-right"),
  sourceCanvas: document.querySelector("#sourceCanvas"),
  cardCanvas: document.querySelector("#cardCanvas"),
  aiEndpoint: document.querySelector("#aiEndpoint"),
  aiSecret: document.querySelector("#aiSecret"),
  saveAiSettingsButton: document.querySelector("#saveAiSettingsButton"),
  aiStatus: document.querySelector("#aiStatus"),
  systemStatusLed: document.querySelector("#systemStatusLed"),
  systemStatusText: document.querySelector("#systemStatusText"),
  powerLed: document.querySelector("#powerLed"),
  aiLed: document.querySelector("#aiLed"),
  syncLed: document.querySelector("#syncLed"),
  scanLed: document.querySelector("#scanLed"),
  scanStatusText: document.querySelector("#scanStatusText"),
  aiSummaryLed: document.querySelector("#aiSummaryLed"),
  aiSummaryText: document.querySelector("#aiSummaryText"),
  footerPowerLed: document.querySelector("#footerPowerLed"),
  footerAiLed: document.querySelector("#footerAiLed"),
  footerSyncLed: document.querySelector("#footerSyncLed"),
  appShell: document.querySelector("#appShell"),
  bootScreen: document.querySelector("#bootScreen"),
  skipBootButton: document.querySelector("#skipBootButton"),
  bootProgressBar: document.querySelector("#bootProgressBar"),
  bootReadyText: document.querySelector("#bootReadyText"),
  bootLine3: document.querySelector("#bootLine3"),
  bootLine4: document.querySelector("#bootLine4"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
  closeSettingsButton: document.querySelector("#closeSettingsButton"),
  settingsDrawer: document.querySelector("#settingsDrawer"),
  settingsBackdrop: document.querySelector("#settingsBackdrop"),
  settingsLanguage: document.querySelector("#settingsLanguage"),
  resultCountSetting: document.querySelector("#resultCountSetting"),
  bootAnimationToggle: document.querySelector("#bootAnimationToggle"),
  rememberCameraToggle: document.querySelector("#rememberCameraToggle"),
  sleeveModeToggle: document.querySelector("#sleeveModeToggle"),
  debugToggle: document.querySelector("#debugToggle"),
  preferredCameraText: document.querySelector("#preferredCameraText"),
  forgetCameraButton: document.querySelector("#forgetCameraButton"),
  clearCacheButton: document.querySelector("#clearCacheButton"),
  resetSettingsButton: document.querySelector("#resetSettingsButton"),
  maintenanceStatus: document.querySelector("#maintenanceStatus"),
  workerVersionText: document.querySelector("#workerVersionText"),
  switchCameraButton: document.querySelector("#switchCameraButton"),
  activeCameraLabel: document.querySelector("#activeCameraLabel"),
  cameraModeBadge: document.querySelector("#cameraModeBadge"),
  sleeveModeChip: document.querySelector("#sleeveModeChip"),
  cameraMemoryChip: document.querySelector("#cameraMemoryChip"),
  scanTipText: document.querySelector("#scanTipText")
};

let preparedCanvases = [];
let previewObjectUrl = null;
let cameraStream = null;
let ocrWorker = null;
let openCvPromise = null;
let ocrProgressStage = { title: "Texterkennung läuft …", start: 10, end: 70 };
let lastParsed = null;
let lastAiDiagnostic = { status: "Noch nicht ausgeführt", detail: "" };
let imagePreparationToken = 0;
let isAnalyzing = false;
let rearCameras = [];
let activeCameraId = "";
let activeCameraLabel = "Rückkamera";
let cameraSwitchInProgress = false;
let settingsReturnFocus = null;
let drawerTouchStartX = null;
let bootTimeouts = [];

const LED_CLASS_NAMES = ["state-off", "state-green", "state-red", "state-amber", "pulse"];

function applyLed(element, color = "off", pulse = false) {
  if (!element) return;
  element.classList.remove(...LED_CLASS_NAMES);
  element.classList.add(`state-${color}`);
  if (pulse) element.classList.add("pulse");
}

function setPowerState(color = "green", pulse = false) {
  applyLed(els.powerLed, color, pulse);
  applyLed(els.footerPowerLed, color, pulse);
}

function setAiState(color = "off", pulse = false, summaryText = null) {
  applyLed(els.aiLed, color, pulse);
  applyLed(els.footerAiLed, color, pulse);
  applyLed(els.aiSummaryLed, color, pulse);
  if (summaryText && els.aiSummaryText) els.aiSummaryText.textContent = summaryText;
}

function setSyncState(color = "off", pulse = false) {
  applyLed(els.syncLed, color, pulse);
  applyLed(els.footerSyncLed, color, pulse);
}

function setScanState(color = "off", pulse = false, label = null) {
  applyLed(els.scanLed, color, pulse);
  applyLed(els.systemStatusLed, color, pulse);
  if (label && els.scanStatusText) els.scanStatusText.textContent = label;
  if (label && els.systemStatusText) els.systemStatusText.textContent = label;
}

function refreshStatusFromSettings() {
  const hasAi = Boolean(getAiEndpoint());
  setPowerState("green", false);
  setAiState(hasAi ? "green" : "off", false, hasAi ? "Cloudflare aktiv" : "Nicht verbunden");
  setSyncState("off", false);
  setScanState(hasAi ? "green" : "off", false, hasAi ? "KI BEREIT" : "KI AUS");
}

function setAiCheckingState() {
  setAiState("amber", true, "Prüfung läuft");
  setScanState("amber", true, "KI PRÜFUNG");
}

function setAiErrorState() {
  setAiState("red", false, "Cloudflare Fehler");
  setScanState("red", false, "KI FEHLER");
}

function setSyncWorkingState() {
  setSyncState("amber", true);
}

function setSyncSuccessState() {
  setSyncState("green", false);
}

function setSyncErrorState() {
  setSyncState("red", false);
}

function readBooleanSetting(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    return value === "1";
  } catch {
    return fallback;
  }
}

function writeBooleanSetting(key, value) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Private Browsermodi können lokalen Speicher begrenzen.
  }
}

function readTextSetting(key, fallback = "") {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeTextSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Die App bleibt ohne dauerhafte Speicherung nutzbar.
  }
}

function isBootAnimationEnabled() {
  return readBooleanSetting(SETTING_KEYS.bootAnimation, true);
}

function isRememberCameraEnabled() {
  return readBooleanSetting(SETTING_KEYS.rememberCamera, true);
}

function isSleeveModeEnabled() {
  return readBooleanSetting(SETTING_KEYS.sleeveMode, false);
}

function isDebugModeEnabled() {
  return readBooleanSetting(SETTING_KEYS.debugMode, false);
}

function getResultLimit() {
  const value = Number(readTextSetting(SETTING_KEYS.resultCount, "5"));
  return [3, 5, 8].includes(value) ? value : 5;
}

function loadAppSettings() {
  const savedLanguage = readTextSetting(SETTING_KEYS.language, "de");
  const language = savedLanguage === "en" ? "en" : "de";
  if (els.language) els.language.value = language;
  if (els.settingsLanguage) els.settingsLanguage.value = language;
  if (els.resultCountSetting) els.resultCountSetting.value = String(getResultLimit());
  if (els.bootAnimationToggle) els.bootAnimationToggle.checked = isBootAnimationEnabled();
  if (els.rememberCameraToggle) els.rememberCameraToggle.checked = isRememberCameraEnabled();
  if (els.sleeveModeToggle) els.sleeveModeToggle.checked = isSleeveModeEnabled();
  if (els.debugToggle) els.debugToggle.checked = isDebugModeEnabled();
  updateModeIndicators();
  updatePreferredCameraText();
  updateDebugPanelVisibility(false);
}

function handleMainLanguageChange() {
  const language = els.language.value === "en" ? "en" : "de";
  writeTextSetting(SETTING_KEYS.language, language);
  if (els.settingsLanguage) els.settingsLanguage.value = language;
  clearResults();
}

function handleSettingsLanguageChange() {
  const language = els.settingsLanguage.value === "en" ? "en" : "de";
  writeTextSetting(SETTING_KEYS.language, language);
  if (els.language) els.language.value = language;
  clearResults();
}

function handleResultCountChange() {
  const value = ["3", "5", "8"].includes(els.resultCountSetting.value)
    ? els.resultCountSetting.value
    : "5";
  writeTextSetting(SETTING_KEYS.resultCount, value);
}

function handleBootAnimationChange() {
  writeBooleanSetting(SETTING_KEYS.bootAnimation, Boolean(els.bootAnimationToggle.checked));
}

function handleRememberCameraChange() {
  const enabled = Boolean(els.rememberCameraToggle.checked);
  writeBooleanSetting(SETTING_KEYS.rememberCamera, enabled);
  if (!enabled) {
    try { localStorage.removeItem(SETTING_KEYS.preferredCamera); } catch { /* ignorieren */ }
  } else if (activeCameraId) {
    writeTextSetting(SETTING_KEYS.preferredCamera, activeCameraId);
  }
  updateModeIndicators();
  updatePreferredCameraText();
}

function handleSleeveModeChange() {
  writeBooleanSetting(SETTING_KEYS.sleeveMode, Boolean(els.sleeveModeToggle.checked));
  updateModeIndicators();
  updateScannerModeUi();
}

function handleDebugModeChange() {
  writeBooleanSetting(SETTING_KEYS.debugMode, Boolean(els.debugToggle.checked));
  updateDebugPanelVisibility(true);
}

function updateModeIndicators() {
  const sleeve = isSleeveModeEnabled();
  const rememberedCamera = isRememberCameraEnabled() && Boolean(readTextSetting(SETTING_KEYS.preferredCamera, ""));
  els.sleeveModeChip?.classList.toggle("hidden", !sleeve);
  els.cameraMemoryChip?.classList.toggle("hidden", !rememberedCamera);
  if (els.scanTipText) {
    els.scanTipText.textContent = sleeve
      ? "Schutzhüllen-Modus aktiv: Karte und Hülle vollständig im Rahmen halten und Reflexionen leicht seitlich ausrichten."
      : "Richte die Karte möglichst gerade aus. Bei glänzenden Karten helfen gleichmäßiges Licht und wenig Reflexionen.";
  }
}

function updateDebugPanelVisibility(hasNewData = false) {
  if (!els.debugPanel) return;
  const hasData = hasNewData || Boolean(els.ocrText?.textContent?.trim())
    && !els.ocrText.textContent.includes("Noch keine Erkennung");
  els.debugPanel.classList.toggle("hidden", !(isDebugModeEnabled() && hasData));
}

function initializeBootSequence() {
  if (!els.bootScreen) return;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!isBootAnimationEnabled() || reduceMotion) {
    finishBootSequence();
    return;
  }

  document.body.classList.add("modal-open");
  if (els.bootLine3) els.bootLine3.textContent = navigator.mediaDevices?.getUserMedia ? "CAMERA: READY" : "CAMERA: FALLBACK";
  if (els.bootLine4) els.bootLine4.textContent = getAiEndpoint() ? "AI LINK: CONFIGURED" : "AI LINK: LOCAL MODE";

  const steps = [
    [180, 14, "POWER CHECK"],
    [440, 36, "CAMERA MODULE"],
    [720, 61, "VISION MODULE"],
    [1010, 82, "DATABASE LINK"],
    [1280, 100, "SYSTEM READY"]
  ];
  for (const [delay, progress, label] of steps) {
    bootTimeouts.push(setTimeout(() => {
      if (els.bootProgressBar) els.bootProgressBar.style.width = `${progress}%`;
      if (els.bootReadyText) els.bootReadyText.textContent = label;
    }, delay));
  }
  bootTimeouts.push(setTimeout(finishBootSequence, 1680));
}

function finishBootSequence() {
  for (const timeout of bootTimeouts) clearTimeout(timeout);
  bootTimeouts = [];
  if (!els.bootScreen || els.bootScreen.classList.contains("boot-hidden")) return;
  if (els.bootProgressBar) els.bootProgressBar.style.width = "100%";
  if (els.bootReadyText) els.bootReadyText.textContent = "SYSTEM READY";
  els.bootScreen.classList.add("boot-hidden");
  document.documentElement.classList.remove("boot-disabled");
  document.body.classList.remove("modal-open");
  setTimeout(() => {
    if (els.bootScreen) els.bootScreen.setAttribute("aria-hidden", "true");
  }, 380);
}

function openSettingsDrawer() {
  if (!els.settingsDrawer || els.settingsDrawer.classList.contains("open")) return;
  settingsReturnFocus = document.activeElement;
  loadAppSettings();
  els.settingsDrawer.classList.add("open");
  els.settingsBackdrop?.classList.add("open");
  els.settingsDrawer.setAttribute("aria-hidden", "false");
  els.openSettingsButton?.setAttribute("aria-expanded", "true");
  document.body.classList.add("drawer-open");
  refreshWorkerVersionSilently();
  setTimeout(() => els.closeSettingsButton?.focus({ preventScroll: true }), 180);
}

function closeSettingsDrawer() {
  if (!els.settingsDrawer?.classList.contains("open")) return;
  els.settingsDrawer.classList.remove("open");
  els.settingsBackdrop?.classList.remove("open");
  els.settingsDrawer.setAttribute("aria-hidden", "true");
  els.openSettingsButton?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("drawer-open");
  settingsReturnFocus?.focus?.({ preventScroll: true });
  settingsReturnFocus = null;
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") return;
  if (els.settingsDrawer?.classList.contains("open")) {
    closeSettingsDrawer();
  } else if (!els.scannerModal?.classList.contains("hidden")) {
    closeLiveScanner();
  }
}

function handleDrawerTouchStart(event) {
  drawerTouchStartX = event.changedTouches?.[0]?.clientX ?? null;
}

function handleDrawerTouchEnd(event) {
  if (drawerTouchStartX === null) return;
  const endX = event.changedTouches?.[0]?.clientX ?? drawerTouchStartX;
  const distance = endX - drawerTouchStartX;
  drawerTouchStartX = null;
  if (distance > 72) closeSettingsDrawer();
}

function updatePreferredCameraText() {
  if (!els.preferredCameraText) return;
  const saved = readTextSetting(SETTING_KEYS.preferredCamera, "");
  if (!isRememberCameraEnabled() || !saved) {
    els.preferredCameraText.textContent = "Automatische Rückkamera";
    return;
  }
  const camera = rearCameras.find(item => item.deviceId === saved);
  els.preferredCameraText.textContent = camera
    ? formatCameraLabel(camera, rearCameras.indexOf(camera))
    : "Gespeicherte Rückkamera";
}

function forgetPreferredCamera() {
  try { localStorage.removeItem(SETTING_KEYS.preferredCamera); } catch { /* ignorieren */ }
  updatePreferredCameraText();
  updateModeIndicators();
  showMaintenanceStatus("Gespeicherte Kamerawahl wurde entfernt.");
}

async function clearApplicationCache() {
  if (!els.clearCacheButton) return;
  els.clearCacheButton.disabled = true;
  showMaintenanceStatus("App-Cache wird geleert …");
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    const registrations = "serviceWorker" in navigator
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    await Promise.all(registrations.map(registration => registration.update().catch(() => {})));
    showMaintenanceStatus("Cache geleert. Beim nächsten Laden werden alle Dateien neu abgerufen.", true);
  } catch (error) {
    console.error(error);
    showMaintenanceStatus("Der Cache konnte nicht vollständig geleert werden.", false, true);
  } finally {
    els.clearCacheButton.disabled = false;
  }
}

function resetApplicationSettings() {
  const confirmed = window.confirm("Startanimation, Kamera-, Scanner- und Anzeigeeinstellungen zurücksetzen? Die KI-Verbindung bleibt erhalten.");
  if (!confirmed) return;
  for (const key of Object.values(SETTING_KEYS)) {
    try { localStorage.removeItem(key); } catch { /* ignorieren */ }
  }
  loadAppSettings();
  showMaintenanceStatus("Bedienungseinstellungen wurden zurückgesetzt. Die KI-Verbindung wurde beibehalten.", true);
}

function showMaintenanceStatus(message, success = false, error = false) {
  if (!els.maintenanceStatus) return;
  els.maintenanceStatus.textContent = message;
  els.maintenanceStatus.style.color = error ? "#ffc2be" : success ? "#a9e2ac" : "#b5bcb5";
}

async function refreshWorkerVersionSilently() {
  const endpoint = getAiEndpoint();
  if (!els.workerVersionText) return;
  if (!endpoint) {
    els.workerVersionText.textContent = "nicht verbunden";
    return;
  }
  try {
    const response = await fetch(`${endpoint}/health`, { cache: "no-store" });
    const data = response.ok ? await response.json() : null;
    els.workerVersionText.textContent = data?.version ? String(data.version) : `Status ${response.status}`;
  } catch {
    els.workerVersionText.textContent = "nicht erreichbar";
  }
}

loadAppSettings();
loadAiSettings();
refreshStatusFromSettings();
initializeBootSequence();

els.openScannerButton.addEventListener("click", openLiveScanner);
els.closeScannerButton.addEventListener("click", closeLiveScanner);
els.captureButton.addEventListener("click", captureLiveCard);
els.switchCameraButton?.addEventListener("click", switchToNextCamera);
els.cameraInput.addEventListener("change", handleImageSelection);
els.galleryInput.addEventListener("change", handleImageSelection);
els.analyzeButton.addEventListener("click", analyzePreparedCard);
els.manualSearchButton.addEventListener("click", manualSearch);
els.language.addEventListener("change", handleMainLanguageChange);
els.settingsLanguage?.addEventListener("change", handleSettingsLanguageChange);
els.resultCountSetting?.addEventListener("change", handleResultCountChange);
els.bootAnimationToggle?.addEventListener("change", handleBootAnimationChange);
els.rememberCameraToggle?.addEventListener("change", handleRememberCameraChange);
els.sleeveModeToggle?.addEventListener("change", handleSleeveModeChange);
els.debugToggle?.addEventListener("change", handleDebugModeChange);
els.openSettingsButton?.addEventListener("click", openSettingsDrawer);
els.closeSettingsButton?.addEventListener("click", closeSettingsDrawer);
els.settingsBackdrop?.addEventListener("click", closeSettingsDrawer);
els.forgetCameraButton?.addEventListener("click", forgetPreferredCamera);
els.clearCacheButton?.addEventListener("click", clearApplicationCache);
els.resetSettingsButton?.addEventListener("click", resetApplicationSettings);
els.skipBootButton?.addEventListener("click", finishBootSequence);
els.bootScreen?.addEventListener("click", finishBootSequence);
els.saveAiSettingsButton?.addEventListener("click", saveAiSettings);
els.settingsDrawer?.addEventListener("touchstart", handleDrawerTouchStart, { passive: true });
els.settingsDrawer?.addEventListener("touchend", handleDrawerTouchEnd, { passive: true });
window.addEventListener("resize", updateScannerShades);
document.addEventListener("keydown", handleGlobalKeydown);
navigator.mediaDevices?.addEventListener?.("devicechange", handleCameraDeviceChange);
window.addEventListener("pagehide", () => {
  finishBootSequence();
  stopCameraStream();
  terminateOcrWorker();
  releasePreparedCanvases();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && !els.scannerModal.classList.contains("hidden")) closeLiveScanner();
});

window.addEventListener("error", () => setPowerState("red", false));
window.addEventListener("unhandledrejection", () => setPowerState("red", false));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      registration.update().catch(() => {});
    } catch {
      // Die Web-App bleibt online auch ohne Offline-Cache nutzbar.
    }
  });
}

async function openLiveScanner() {
  clearResults();
  if (!navigator.mediaDevices?.getUserMedia) {
    els.cameraInput.click();
    return;
  }

  closeSettingsDrawer();
  els.scannerModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  els.captureButton.disabled = true;
  els.cameraStatus.textContent = "Kamera wird gestartet …";
  updateScannerModeUi();

  const preferredCamera = isRememberCameraEnabled()
    ? readTextSetting(SETTING_KEYS.preferredCamera, "")
    : "";

  try {
    await startCamera(preferredCamera, true);
    els.captureButton.disabled = false;
    els.cameraStatus.textContent = isSleeveModeEnabled()
      ? "Hülle vollständig ausrichten und Spiegelungen leicht seitlich halten."
      : "Karte vollständig in den Rahmen legen.";
    requestAnimationFrame(updateScannerShades);
  } catch (error) {
    console.error(error);
    els.cameraStatus.textContent = "Kamerazugriff nicht möglich. Nutze unten die Kamera-App als Alternative.";
    els.captureButton.disabled = true;
  }
}

async function startCamera(deviceId = "", allowFallback = true) {
  if (cameraSwitchInProgress) return;
  cameraSwitchInProgress = true;
  els.switchCameraButton?.setAttribute("disabled", "");
  els.captureButton.disabled = true;

  try {
    stopCameraStream();
    const baseVideo = {
      width: { ideal: 1920 },
      height: { ideal: 2560 }
    };
    const requestedVideo = deviceId
      ? { ...baseVideo, deviceId: { exact: deviceId } }
      : { ...baseVideo, facingMode: { ideal: "environment" } };

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: requestedVideo });
    } catch (error) {
      if (!deviceId || !allowFallback) throw error;
      try { localStorage.removeItem(SETTING_KEYS.preferredCamera); } catch { /* ignorieren */ }
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...baseVideo, facingMode: { ideal: "environment" } }
      });
    }

    els.cameraVideo.srcObject = cameraStream;
    await els.cameraVideo.play();
    const track = cameraStream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    activeCameraId = settings.deviceId || deviceId || "";

    await refreshRearCameraList();
    updateActiveCameraLabel();

    if (isRememberCameraEnabled() && activeCameraId) {
      writeTextSetting(SETTING_KEYS.preferredCamera, activeCameraId);
    }
    updateModeIndicators();
    updatePreferredCameraText();
    requestAnimationFrame(updateScannerShades);
  } finally {
    cameraSwitchInProgress = false;
    els.switchCameraButton?.removeAttribute("disabled");
    if (cameraStream) els.captureButton.disabled = false;
  }
}

function closeLiveScanner() {
  stopCameraStream();
  els.scannerModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function stopCameraStream() {
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop();
  }
  cameraStream = null;
  if (els.cameraVideo?.srcObject) els.cameraVideo.srcObject = null;
}

async function refreshRearCameraList() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    rearCameras = [];
    updateCameraSwitcherVisibility();
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter(device => device.kind === "videoinput" && device.deviceId);
    const frontPattern = /(front|user|facetime|vorder|frontal|avant|selfie)/i;
    const nonFront = videoInputs.filter(device => !frontPattern.test(device.label || ""));
    rearCameras = dedupeCameraDevices(nonFront.length ? nonFront : videoInputs);

    if (activeCameraId && !rearCameras.some(device => device.deviceId === activeCameraId)) {
      const activeDevice = videoInputs.find(device => device.deviceId === activeCameraId);
      if (activeDevice) rearCameras.unshift(activeDevice);
    }
    updateCameraSwitcherVisibility();
  } catch (error) {
    console.warn("Kameraliste konnte nicht gelesen werden:", error);
    rearCameras = [];
    updateCameraSwitcherVisibility();
  }
}

function dedupeCameraDevices(devices) {
  const seen = new Set();
  return devices.filter(device => {
    if (!device.deviceId || seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    return true;
  });
}

function formatCameraLabel(device, index = 0) {
  const label = String(device?.label || "").trim();
  const normalized = label.toLowerCase();
  if (/ultra|0[,.]5|ultraweit/.test(normalized)) return "0,5× Ultraweitwinkel";
  if (/tele|telephoto/.test(normalized)) return "Telekamera";
  if (/dual|triple|multi/.test(normalized)) return "Automatische Rückkamera";
  if (/wide|back|rear|rück|hinten|environment/.test(normalized)) return "1× Rückkamera";
  return label || `Rückkamera ${index + 1}`;
}

function updateActiveCameraLabel() {
  const index = Math.max(0, rearCameras.findIndex(device => device.deviceId === activeCameraId));
  const device = rearCameras[index];
  activeCameraLabel = device ? formatCameraLabel(device, index) : "Rückkamera";
  if (els.activeCameraLabel) els.activeCameraLabel.textContent = activeCameraLabel;
}

function updateCameraSwitcherVisibility() {
  const show = rearCameras.length > 1;
  els.switchCameraButton?.classList.toggle("hidden", !show);
  updateActiveCameraLabel();
}

async function switchToNextCamera() {
  if (cameraSwitchInProgress || rearCameras.length < 2) return;
  const currentIndex = rearCameras.findIndex(device => device.deviceId === activeCameraId);
  const nextIndex = (currentIndex + 1 + rearCameras.length) % rearCameras.length;
  const nextCamera = rearCameras[nextIndex];
  const previousCameraId = activeCameraId;
  els.cameraStatus.textContent = "Kamera wird gewechselt …";

  try {
    await startCamera(nextCamera.deviceId, false);
    els.cameraStatus.textContent = `${formatCameraLabel(nextCamera, nextIndex)} aktiv.`;
  } catch (error) {
    console.error(error);
    els.cameraStatus.textContent = "Diese Kamera konnte nicht geöffnet werden. Vorherige Kamera wird wiederhergestellt …";
    try {
      await startCamera(previousCameraId, true);
      els.cameraStatus.textContent = "Vorherige Kamera wieder aktiv.";
    } catch (restoreError) {
      console.error(restoreError);
      els.cameraStatus.textContent = "Kamera konnte nicht erneut gestartet werden.";
    }
  }
}

async function handleCameraDeviceChange() {
  if (!els.scannerModal || els.scannerModal.classList.contains("hidden")) return;
  await refreshRearCameraList();
}

function updateScannerModeUi() {
  const sleeve = isSleeveModeEnabled();
  els.scannerGuide?.classList.toggle("sleeve-guide", sleeve);
  els.cameraModeBadge?.classList.toggle("hidden", !sleeve);
  requestAnimationFrame(updateScannerShades);
}

function updateScannerShades() {
  if (els.scannerModal.classList.contains("hidden")) return;
  const viewport = els.cameraViewport.getBoundingClientRect();
  const guide = els.scannerGuide.getBoundingClientRect();
  if (!viewport.width || !guide.width) return;

  const top = guide.top - viewport.top;
  const left = guide.left - viewport.left;
  const right = viewport.right - guide.right;
  const bottom = viewport.bottom - guide.bottom;

  Object.assign(els.shadeTop.style, { left: "0", top: "0", width: "100%", height: `${Math.max(0, top)}px` });
  Object.assign(els.shadeBottom.style, { left: "0", bottom: "0", width: "100%", height: `${Math.max(0, bottom)}px` });
  Object.assign(els.shadeLeft.style, { left: "0", top: `${Math.max(0, top)}px`, width: `${Math.max(0, left)}px`, height: `${Math.max(0, guide.height)}px` });
  Object.assign(els.shadeRight.style, { right: "0", top: `${Math.max(0, top)}px`, width: `${Math.max(0, right)}px`, height: `${Math.max(0, guide.height)}px` });
}

async function captureLiveCard() {
  if (!cameraStream || !els.cameraVideo.videoWidth) return;
  els.captureButton.disabled = true;
  els.cameraStatus.textContent = "Aufnahme wird vorbereitet …";

  try {
    const canvas = captureGuideFromVideo(els.cameraVideo, els.cameraViewport, els.scannerGuide);
    const canvases = isSleeveModeEnabled()
      ? [enhanceSleevedCapture(canvas), canvas]
      : [canvas];
    await setPreparedCanvases(
      canvases,
      "Live-Scanner",
      isSleeveModeEnabled() ? "Schutzhüllen-Modus · Reflexionsausgleich" : "exakt zugeschnitten"
    );
    refreshStatusFromSettings();
    closeLiveScanner();
    els.previewWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error(error);
    els.cameraStatus.textContent = "Aufnahme fehlgeschlagen. Bitte erneut versuchen.";
    els.captureButton.disabled = false;
  }
}

function captureGuideFromVideo(video, viewportElement, guideElement) {
  const viewport = viewportElement.getBoundingClientRect();
  const guide = guideElement.getBoundingClientRect();
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;

  const coverScale = Math.max(viewport.width / sourceWidth, viewport.height / sourceHeight);
  const displayedWidth = sourceWidth * coverScale;
  const displayedHeight = sourceHeight * coverScale;
  const hiddenX = (displayedWidth - viewport.width) / 2;
  const hiddenY = (displayedHeight - viewport.height) / 2;

  let sx = (guide.left - viewport.left + hiddenX) / coverScale;
  let sy = (guide.top - viewport.top + hiddenY) / coverScale;
  let sw = guide.width / coverScale;
  let sh = guide.height / coverScale;

  // Im Schutzhüllen-Modus bleibt etwas mehr Rand erhalten, damit Sleeve oder
  // Toploader nicht versehentlich die eigentliche Kartenkante abschneiden.
  const safetyMargin = isSleeveModeEnabled() ? 0.038 : 0.012;
  const marginX = sw * safetyMargin;
  const marginY = sh * safetyMargin;
  sx = Math.max(0, sx - marginX);
  sy = Math.max(0, sy - marginY);
  sw = Math.min(sourceWidth - sx, sw + marginX * 2);
  sh = Math.min(sourceHeight - sy, sh + marginY * 2);

  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  return canvas;
}

async function handleImageSelection(event) {
  const file = event.target.files?.[0];
  if (!file || isAnalyzing) return;

  const token = ++imagePreparationToken;
  setBusy(true);
  clearResults();

  try {
    setProgress("Vorheriges Bild wird freigegeben …", 3);
    await terminateOcrWorker();
    releasePreparedCanvases();

    setProgress("Bild wird speicherschonend geladen …", 8);
    const source = await loadFileToLimitedCanvas(file, GALLERY_MAX_DIMENSION, 15000);

    if (token !== imagePreparationToken) {
      releaseCanvas(source);
      return;
    }

    setProgress("Kartenbereich wird vorbereitet …", 35);
    const prepared = prepareGalleryCanvases(source);
    releaseCanvas(source);

    if (token !== imagePreparationToken) {
      prepared.canvases.forEach(releaseCanvas);
      return;
    }

    await setPreparedCanvases(prepared.canvases, "Bildauswahl", prepared.status);
    refreshStatusFromSettings();
    setProgress("Bild ist bereit", 100);
    els.previewWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    console.error(error);
    setSyncErrorState();
    showError("Das Bild konnte nicht vorbereitet werden. Bitte versuche es erneut oder nutze den Live-Scanner.");
  } finally {
    event.target.value = "";
    if (token === imagePreparationToken) setBusy(false);
  }
}

function prepareGalleryCanvases(sourceCanvas) {
  /*
   * Galerie-Fotos werden bewusst ohne OpenCV vorbereitet. Das große
   * WebAssembly-Paket war auf iPhones die häufigste Ursache für Hänger direkt
   * nach der Bildauswahl. Zwei leichte Ausschnitte reichen für die KI und die
   * lokale Rückfallerkennung aus und halten den Speicherverbrauch niedrig.
   */
  if (isSleeveModeEnabled()) {
    const original = centerCardCrop(sourceCanvas, 0.92, -0.02);
    return {
      canvases: [enhanceSleevedCapture(original), original],
      status: "Schutzhüllen-Modus · Reflexionsausgleich"
    };
  }

  return {
    canvases: [
      centerCardCrop(sourceCanvas, 0.90, -0.025),
      centerCardCrop(sourceCanvas, 0.72, -0.025)
    ],
    status: "speicherschonend vorbereitet · KI zuerst"
  };
}

function enhanceSleevedCapture(sourceCanvas) {
  const canvas = createCanvas(sourceCanvas.width, sourceCanvas.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  try {
    ctx.filter = "contrast(1.12) brightness(1.025) saturate(0.94)";
  } catch {
    // Ältere Browser ignorieren den Filter und nutzen die unveränderte Kopie.
  }
  ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";
  return canvas;
}

async function setPreparedCanvases(canvases, label, status) {
  releasePreparedCanvases();
  preparedCanvases = canvases.filter(Boolean).slice(0, MAX_PREPARED_CANVASES);
  if (!preparedCanvases.length) throw new Error("Kein Kartenausschnitt verfügbar.");

  const displayCanvas = preparedCanvases[0];
  copyCanvas(displayCanvas, els.cardCanvas);
  await updatePreviewFromCanvas(displayCanvas);
  els.previewLabel.textContent = label === "Live-Scanner" ? "Aufgenommener Kartenausschnitt" : "Vorbereiteter Kartenausschnitt";
  els.cropStatus.textContent = status;
  els.previewWrap.classList.remove("hidden");
}


async function updatePreviewFromCanvas(canvas) {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.82);
  previewObjectUrl = URL.createObjectURL(blob);
  els.previewImage.src = previewObjectUrl;
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.82) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Vorschaubild konnte nicht erzeugt werden."));
    }, type, quality);
  });
}

function releaseCanvas(canvas) {
  if (!canvas || canvas === els.cardCanvas || canvas === els.sourceCanvas) return;
  try {
    canvas.width = 1;
    canvas.height = 1;
  } catch {
    // Bereits freigegebene Canvas-Flächen ignorieren.
  }
}

function releasePreparedCanvases() {
  for (const canvas of preparedCanvases) releaseCanvas(canvas);
  preparedCanvases = [];

  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }

  if (els.previewImage) {
    els.previewImage.removeAttribute("src");
  }
}

function compactPreparedCanvases() {
  if (preparedCanvases.length <= 1) return;
  const first = preparedCanvases[0];
  preparedCanvases.slice(1).forEach(releaseCanvas);
  preparedCanvases = first ? [first] : [];
}

async function terminateOcrWorker() {
  const worker = ocrWorker?.worker;
  ocrWorker = null;
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    // Ein bereits von iOS beendeter Worker muss nicht erneut beendet werden.
  }
}

function loadFileToLimitedCanvas(file, maxDimension, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let settled = false;

    const cleanup = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      image.onload = null;
      image.onerror = null;
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try { image.src = ""; } catch { /* ignorieren */ }
      reject(new Error("Das Bildladen dauerte zu lange und wurde abgebrochen."));
    }, timeoutMs);

    image.onload = () => {
      if (settled) return;
      settled = true;
      try {
        const canvas = drawImageToLimitedCanvas(image, maxDimension);
        cleanup();
        try { image.src = ""; } catch { /* ignorieren */ }
        resolve(canvas);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    image.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("Bild konnte nicht geladen werden."));
    };

    image.src = url;
  });
}


function loadAiSettings() {
  if (!els.aiEndpoint) return;
  els.aiEndpoint.value = localStorage.getItem(AI_ENDPOINT_KEY) || "";
  els.aiSecret.value = localStorage.getItem(AI_SECRET_KEY) || "";
  updateAiStatus();
  refreshStatusFromSettings();
}

async function saveAiSettings() {
  const endpoint = String(els.aiEndpoint?.value || "").trim().replace(/\/+$/, "");
  const secret = String(els.aiSecret?.value || "").trim();
  if (endpoint && !/^https:\/\//i.test(endpoint)) {
    els.aiStatus.textContent = "Bitte eine vollständige HTTPS-Adresse eintragen.";
    els.aiStatus.className = "ai-status error";
    setAiErrorState();
    return;
  }
  localStorage.setItem(AI_ENDPOINT_KEY, endpoint);
  localStorage.setItem(AI_SECRET_KEY, secret);

  if (!endpoint) {
    updateAiStatus();
    refreshStatusFromSettings();
    return;
  }

  els.aiStatus.textContent = "KI-Verbindung wird geprüft …";
  els.aiStatus.className = "ai-status muted";
  setAiCheckingState();

  try {
    const response = await fetch(`${endpoint}/health`, { cache: "no-store" });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* Text bleibt für Diagnose erhalten. */ }

    if (!response.ok || !data?.ok) {
      throw new Error(`Status ${response.status}: ${text.slice(0, 220) || "keine Antwort"}`);
    }

    els.aiStatus.textContent = `KI-Verbindung hergestellt · CardDex AI ${data.version || ""}`.trim();
    els.aiStatus.className = "ai-status success";
    if (els.workerVersionText) els.workerVersionText.textContent = data.version ? String(data.version) : "verbunden";
    setAiState("green", false, "Cloudflare aktiv");
    setScanState("green", false, "KI BEREIT");
  } catch (error) {
    els.aiStatus.textContent = `Worker nicht erreichbar: ${String(error?.message || error)}`;
    els.aiStatus.className = "ai-status error";
    if (els.workerVersionText) els.workerVersionText.textContent = "nicht erreichbar";
    setAiErrorState();
  }
}

function updateAiStatus() {
  if (!els.aiStatus) return;
  const endpoint = getAiEndpoint();
  els.aiStatus.textContent = endpoint
    ? "KI-Erkennung aktiv. OCR und Bildvergleich bleiben als Rückfallebene eingeschaltet."
    : "Noch nicht verbunden. Die App nutzt weiterhin die lokale Hybrid-Erkennung.";
  els.aiStatus.className = `ai-status ${endpoint ? "success" : "muted"}`;
  if (endpoint) {
    setAiState("green", false, "Cloudflare aktiv");
    setScanState("green", false, "KI BEREIT");
  } else {
    setAiState("off", false, "Nicht verbunden");
    setScanState("off", false, "KI AUS");
    if (els.workerVersionText) els.workerVersionText.textContent = "nicht verbunden";
  }
}

function getAiEndpoint() {
  return String(localStorage.getItem(AI_ENDPOINT_KEY) || "").trim().replace(/\/+$/, "");
}

async function identifyCardWithAi(canvas) {
  const endpoint = getAiEndpoint();
  if (!endpoint) return null;

  const yellowBorder = isLikelyYellowBorderCard(canvas);
  const attempts = yellowBorder
    ? [
        { mode: "detail", label: "Gelbrahmen-Detailansicht", create: () => createAiDetailSheet(canvas) },
        { mode: "full", label: "Vollbild", create: () => createAiFullCardCanvas(canvas) }
      ]
    : [
        { mode: "full", label: "Vollbild", create: () => createAiFullCardCanvas(canvas) },
        { mode: "detail", label: "Detailansicht", create: () => createAiDetailSheet(canvas) }
      ];
  const errors = [];
  let partialResult = null;
  lastAiDiagnostic = { status: "Anfrage läuft", detail: yellowBorder ? "Gelber Rahmen erkannt · Detailanalyse" : "Vollbildanalyse" };
  setAiCheckingState();

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (attempt.mode === "detail") {
      setProgress("KI prüft Name und Kartennummer vergrößert …", index === 0 ? 16 : 28);
      lastAiDiagnostic = { status: yellowBorder ? "Gelbrahmen-Detailanalyse" : "Detailanalyse", detail: "Name und Sammlernummer werden vergrößert geprüft." };
    } else if (index > 0) {
      setProgress("KI prüft zusätzlich das vollständige Kartenbild …", 28);
    }

    const attemptCanvas = attempt.create();
    try {
      const result = await requestAiIdentification(attemptCanvas, attempt.mode);
      if (hasUsefulAiResult(result)) {
        const merged = mergeAiAttemptResults(partialResult, result);
        if (hasStrongAiFields(merged) || attempt.mode === "detail") {
          merged._attempt = attempt.mode;
          merged._yellowBorder = yellowBorder;
          lastAiDiagnostic = {
            status: `${attempt.label} erfolgreich`,
            detail: `Name: ${merged.name || "–"} · Nummer: ${merged.number || "–"}${merged.denominator ? `/${merged.denominator}` : ""}`
          };
          setAiState("green", false, "Cloudflare aktiv");
          setScanState("green", false, "KI BEREIT");
          return merged;
        }
        partialResult = merged;
        errors.push(`${attempt.label}: nur Teilergebnis`);
      } else {
        errors.push(`${attempt.label}: keine verwertbaren Kartendaten`);
      }
    } catch (error) {
      errors.push(`${attempt.label}: ${String(error?.message || error)}`);
    } finally {
      releaseCanvas(attemptCanvas);
    }
  }

  if (partialResult && hasUsefulAiResult(partialResult)) {
    partialResult._attempt = "partial";
    partialResult._yellowBorder = yellowBorder;
    lastAiDiagnostic = {
      status: "KI-Teilergebnis",
      detail: `Name: ${partialResult.name || "–"} · Nummer: ${partialResult.number || "–"}${partialResult.denominator ? `/${partialResult.denominator}` : ""}`
    };
    setAiState("green", false, "Cloudflare aktiv");
    setScanState("amber", false, "KI + OCR");
    return partialResult;
  }

  lastAiDiagnostic = {
    status: "Keine KI-Daten",
    detail: errors.join(" · ").slice(0, 700)
  };
  setAiErrorState();
  throw new Error(errors.join(" · ") || "Die KI konnte keine Kartendaten lesen.");
}

function isLikelyYellowBorderCard(source) {
  if (!source || source.width < 40 || source.height < 40) return false;
  const sampleCanvas = createCanvas(80, 112);
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleContext.drawImage(source, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;

  const fractions = [0.04, 0.06, 0.08, 0.92, 0.94, 0.96];
  let yellow = 0;
  let valid = 0;
  for (let index = 1; index <= 22; index += 1) {
    const along = index / 23;
    for (const edge of fractions) {
      for (const [fx, fy] of [[edge, along], [along, edge]]) {
        const x = Math.max(0, Math.min(sampleCanvas.width - 1, Math.round(sampleCanvas.width * fx)));
        const y = Math.max(0, Math.min(sampleCanvas.height - 1, Math.round(sampleCanvas.height * fy)));
        const offset = (y * sampleCanvas.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        valid += 1;
        if (red >= 145 && green >= 105 && blue <= 135 && red > blue * 1.35 && green > blue * 1.18) yellow += 1;
      }
    }
  }
  releaseCanvas(sampleCanvas);
  return valid > 0 && yellow / valid >= 0.13;
}

function createAiFullCardCanvas(source) {
  const canvas = createCanvas(720, 1008);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function createAiDetailSheet(source) {
  const canvas = createCanvas(1400, 1000);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#202326";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f7f4ea";
  ctx.font = "700 28px ui-monospace, monospace";
  ctx.fillText("FULL CARD", 34, 52);
  ctx.fillText("NAME / KP", 660, 52);
  ctx.fillText("COLLECTOR NUMBER / SET", 660, 385);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, source.width, source.height, 30, 75, 580, 812);

  drawAiDetailRegion(ctx, source, { x: 0.075, y: 0.005, width: 0.83, height: 0.145 }, 650, 75, 720, 270);
  drawAiDetailRegion(ctx, source, { x: 0.005, y: 0.825, width: 0.91, height: 0.17 }, 650, 410, 720, 260);
  drawAiDetailRegion(ctx, source, { x: 0.005, y: 0.885, width: 0.68, height: 0.105 }, 650, 730, 720, 190);

  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 8;
  ctx.strokeRect(26, 71, 588, 820);
  ctx.strokeRect(646, 71, 728, 278);
  ctx.strokeRect(646, 406, 728, 268);
  ctx.strokeRect(646, 726, 728, 198);
  return canvas;
}

function drawAiDetailRegion(ctx, source, region, dx, dy, dw, dh) {
  const sx = Math.round(source.width * region.x);
  const sy = Math.round(source.height * region.y);
  const sw = Math.round(source.width * region.width);
  const sh = Math.round(source.height * region.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dx, dy, dw, dh);
  ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
}

async function requestAiIdentification(canvas, mode) {
  const endpoint = getAiEndpoint();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  let image = "";

  try {
    image = canvas.toDataURL("image/jpeg", mode === "detail" ? 0.84 : 0.80);
    const headers = { "content-type": "application/json" };
    const secret = String(localStorage.getItem(AI_SECRET_KEY) || "").trim();
    if (secret) headers["x-scanner-key"] = secret;

    const response = await fetch(`${endpoint}/identify`, {
      method: "POST",
      headers,
      body: JSON.stringify({ image, language: els.language.value, mode }),
      signal: controller.signal,
      cache: "no-store"
    });

    const responseText = await response.text();
    let result = null;
    try { result = JSON.parse(responseText); } catch { /* Rohtext wird unten ausgegeben. */ }

    if (!response.ok) {
      const detail = result?.detail || result?.error || responseText || "keine Serverantwort";
      throw new Error(`KI-Dienst ${response.status}: ${detail}`);
    }
    if (!result || typeof result !== "object") throw new Error("Ungültige KI-Antwort");
    if (result.error) throw new Error(String(result.detail || result.error));
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Zeitüberschreitung nach 55 Sekunden");
    throw error;
  } finally {
    image = "";
    clearTimeout(timeout);
  }
}

function hasUsefulAiResult(result) {
  if (!result || typeof result !== "object") return false;
  const name = String(result.name || "").trim();
  const number = normalizeCollectorNumber(result.number || "");
  const rejectedName = /^usions?$|fusions?[-\s]*angriff|fusion[-\s]*strike|fließender[-\s]*angriff|rapid[-\s]*strike/i.test(name);
  return Boolean(number || (name.length >= 3 && !rejectedName));
}

function hasStrongAiFields(result) {
  return Boolean(String(result?.name || "").trim().length >= 3 && normalizeCollectorNumber(result?.number || ""));
}

function mergeAiAttemptResults(first, second) {
  const a = first && typeof first === "object" ? first : {};
  const b = second && typeof second === "object" ? second : {};
  return {
    ...a,
    ...b,
    name: String(b.name || a.name || "").trim(),
    number: normalizeCollectorNumber(b.number || a.number || ""),
    denominator: String(b.denominator || a.denominator || "").replace(/\D/g, ""),
    setCode: String(b.setCode || a.setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    language: b.language || a.language || els.language.value,
    confidence: Math.max(Number(a.confidence || 0), Number(b.confidence || 0)),
    notes: [a.notes, b.notes].filter(Boolean).join(" · ")
  };
}

function mergeAiResultIntoParsed(parsed, ai) {
  if (!ai) return parsed;
  const name = String(ai.name || "").trim();
  const number = normalizeCollectorNumber(ai.number || "");
  const denominator = String(ai.denominator || "").replace(/\D/g, "");
  const setCode = String(ai.setCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));

  const nameHints = [...parsed.nameHints];
  if (name) {
    nameHints.unshift({
      value: name,
      score: 245 + confidence * 90,
      confidence: Math.round(confidence * 100),
      source: "KI-Bilderkennung"
    });
  }

  const identifiers = [...parsed.identifiers];
  if (number) {
    identifiers.unshift({
      number,
      denominator: denominator || null,
      setCode: setCode || null,
      score: 255 + confidence * 80,
      reliability: Math.max(0.42, Math.min(0.58, confidence || 0.5)),
      kind: "ai",
      source: "KI-Bilderkennung",
      raw: [setCode, number, denominator ? `/${denominator}` : ""].filter(Boolean).join(" ")
    });
  }

  return {
    ...parsed,
    ai,
    nameHints: dedupeBy(nameHints, item => normalizeText(item.value)).slice(0, 14),
    identifiers: dedupeBy(identifiers, item => `${item.setCode || ""}|${item.number || ""}|${item.denominator || ""}`).slice(0, 14),
    numbers: unique([number, ...parsed.numbers].filter(Boolean)),
    denominators: unique([denominator, ...parsed.denominators].filter(Boolean)),
    setCodes: unique([setCode, ...parsed.setCodes].filter(Boolean))
  };
}

function dedupeBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyzePreparedCard() {
  if (!preparedCanvases.length || isAnalyzing) return;

  isAnalyzing = true;
  setBusy(true);
  clearResults();

  let selected = {
    canvas: preparedCanvases[0],
    canvasIndex: 0,
    rotation: 0,
    quality: 0,
    alternatives: [preparedCanvases[0]]
  };
  let ocr = { observations: [] };
  let aiResult = null;
  let parsed = createEmptyParsed();
  let usedLocalOcr = false;

  try {
    setSyncWorkingState();
    if (getAiEndpoint()) {
      setAiCheckingState();
    } else {
      setScanState("amber", true, "LOKALE OCR");
    }
    lastAiDiagnostic = getAiEndpoint()
      ? { status: "Anfrage vorbereitet", detail: "" }
      : { status: "Nicht verbunden", detail: "" };

    /*
     * Der wichtigste Unterschied zu Version 6.1: Die KI läuft zuerst und
     * allein. Tesseract und seine großen Zwischenbilder werden nur noch
     * geladen, wenn die KI ausfällt, unvollständig antwortet oder die
     * Datenbanksuche keinen brauchbaren Kandidaten findet.
     */
    if (getAiEndpoint()) {
      setProgress("KI analysiert die Karte …", 12);
      try {
        aiResult = await identifyCardWithAi(preparedCanvases[0]);
        parsed = mergeAiResultIntoParsed(parsed, aiResult);
      } catch (error) {
        console.warn("KI-Erkennung nicht verfügbar, lokale Rückfallerkennung wird gestartet:", error);
        setScanState("amber", true, "LOKALE OCR");
      }
    }

    let candidates = [];
    if (hasUsefulRecognition(parsed)) {
      setProgress("Kartendatenbank wird durchsucht …", 48);
      candidates = await findCandidates(parsed, els.language.value);
    }

    if (aiResult && candidates.length) {
      const consistency = assessAiCandidateConsistency(aiResult, candidates);
      aiResult._databaseVerified = consistency.verified;
      aiResult._consistencyReason = consistency.reason;

      if (consistency.conflict) {
        const rejected = `${aiResult.number || ""}${aiResult.denominator ? `/${aiResult.denominator}` : ""}`;
        parsed = discardRejectedAiIdentifier(parsed, aiResult);
        aiResult = {
          ...aiResult,
          number: "",
          denominator: "",
          setCode: "",
          confidence: Math.min(0.55, Number(aiResult.confidence || 0.5)),
          _databaseVerified: false,
          _numberRejected: true,
          _rejectedIdentifier: rejected
        };
        parsed.ai = aiResult;
        lastAiDiagnostic = {
          status: "KI-Nummer verworfen",
          detail: `${consistency.reason}. Name „${aiResult.name || "–"}“ wird mit OCR und Bildvergleich weiter geprüft.`
        };
        setScanState("amber", true, "KI + PRÜFUNG");
        candidates = await findCandidates(parsed, els.language.value);
      }
    }

    const needsOcr = !hasStrongAiRecognition(aiResult) || candidates.length === 0;
    if (needsOcr) {
      usedLocalOcr = true;
      setScanState("amber", true, "LOKALE OCR");
      setProgress("Lokale Rückfallerkennung wird geladen …", 52);
      const fallback = await runLightLocalRecognition(preparedCanvases);
      selected = fallback.selected;
      ocr = fallback.ocr;
      parsed = mergeParsedResults(parsed, fallback.parsed);
      if (aiResult) parsed = mergeAiResultIntoParsed(parsed, aiResult);

      setProgress("Kartendatenbank wird erneut durchsucht …", 72);
      candidates = await findCandidates(parsed, els.language.value);
    }

    lastParsed = parsed;
    els.manualName.value = parsed.nameHints[0]?.value || "";
    els.manualNumber.value = formatIdentifierForInput(parsed.identifiers[0]);
    els.ocrText.textContent = formatDebugText(ocr, parsed, selected, aiResult)
      + `

Lokale OCR ausgeführt: ${usedLocalOcr ? "ja" : "nein – KI-Ergebnis war ausreichend"}`;
    updateDebugPanelVisibility(true);

    setProgress("Treffer werden sortiert …", 82);
    // Auch bei erfolgreicher KI wird das Kartenbild gegengeprüft. Dadurch kann
    // eine richtige Namenslesung mit einer halluzinierten Nummer nicht mehr
    // automatisch eine falsche Kartenvariante nach oben ziehen.
    const rankingCanvases = selected.alternatives?.slice(0, 1) || [selected.canvas];
    const ranked = await rankCandidates(
      candidates,
      parsed,
      els.language.value,
      rankingCanvases
    );

    setProgress("Kartendaten werden geladen …", 94);
    const enriched = await enrichTopCandidates(ranked, els.language.value);

    renderResults(enriched, parsed);
    setSyncSuccessState();
    setScanState(getAiEndpoint() ? "green" : "off", false, getAiEndpoint() ? "KI BEREIT" : "KI AUS");
    setProgress("Fertig", 100);
  } catch (error) {
    console.error(error);
    setSyncErrorState();
    showError("Die Erkennung konnte nicht abgeschlossen werden. Bitte prüfe die Internetverbindung oder nutze die manuelle Suche.");
  } finally {
    await terminateOcrWorker();
    if (selected?.canvas && !preparedCanvases.includes(selected.canvas)) releaseCanvas(selected.canvas);
    compactPreparedCanvases();
    isAnalyzing = false;
    setTimeout(() => {
      setBusy(false);
      if (!preparedCanvases.length) refreshStatusFromSettings();
    }, 120);
  }
}

function createEmptyParsed() {
  return {
    rawText: "",
    normalizedText: "",
    nameHints: [],
    mechanics: [],
    identifiers: [],
    numbers: [],
    denominators: [],
    setCodes: []
  };
}

function hasUsefulRecognition(parsed) {
  return Boolean(parsed?.nameHints?.length || parsed?.identifiers?.length);
}

function hasStrongAiRecognition(ai) {
  if (!ai || typeof ai !== "object") return false;
  const name = String(ai.name || "").trim();
  const number = normalizeCollectorNumber(ai.number || "");
  return Boolean(name && number && ai._databaseVerified === true && ai._numberRejected !== true);
}

function cardNameCompatibility(cardName, recognizedName) {
  const card = normalizeText(stripCardMechanics(cardName || ""));
  const recognized = normalizeText(stripCardMechanics(recognizedName || ""));
  if (!card || !recognized) return 0;
  if (card === recognized) return 1;
  if (card.includes(recognized) || recognized.includes(card)) return 0.9;
  return similarity(card, recognized);
}

function assessAiCandidateConsistency(ai, candidates) {
  const name = String(ai?.name || "").trim();
  const number = normalizeCollectorNumber(ai?.number || "");
  if (!name || !number || !Array.isArray(candidates) || !candidates.length) {
    return { verified: false, conflict: false, reason: "unvollständige Prüfdaten" };
  }

  const numberMatches = candidates.filter(card => collectorNumbersEqual(number, card.localId));
  const nameMatches = candidates
    .map(card => ({ card, compatibility: cardNameCompatibility(card.name, name) }))
    .filter(item => item.compatibility >= 0.58);
  const compatibleNumberMatches = numberMatches
    .map(card => ({ card, compatibility: cardNameCompatibility(card.name, name) }))
    .filter(item => item.compatibility >= 0.58);

  if (compatibleNumberMatches.length) {
    return { verified: true, conflict: false, reason: "Name und Nummer passen zu demselben Datenbankeintrag" };
  }

  if (nameMatches.length && (numberMatches.length || !numberMatches.length)) {
    return {
      verified: false,
      conflict: true,
      reason: numberMatches.length
        ? "Die gelesene Nummer gehört in der Datenbank zu einer anderen Karte"
        : "Die gelesene Nummer ist für den erkannten Namen nicht auffindbar"
    };
  }

  return { verified: false, conflict: false, reason: "Datenbankabgleich nicht eindeutig" };
}

function discardRejectedAiIdentifier(parsed, ai) {
  const rejectedNumber = normalizeCollectorNumber(ai?.number || "");
  const keptIdentifiers = (parsed.identifiers || []).filter(item =>
    item.source !== "KI-Bilderkennung" && !collectorNumbersEqual(item.number, rejectedNumber)
  );
  return {
    ...parsed,
    identifiers: keptIdentifiers,
    numbers: unique(keptIdentifiers.map(item => item.number).filter(Boolean)),
    denominators: unique(keptIdentifiers.map(item => item.denominator).filter(Boolean)),
    setCodes: unique(keptIdentifiers.map(item => item.setCode).filter(Boolean))
  };
}

function mergeParsedResults(primary, secondary) {
  const first = primary || createEmptyParsed();
  const second = secondary || createEmptyParsed();
  return {
    ...first,
    rawText: [first.rawText, second.rawText].filter(Boolean).join("\n\n"),
    normalizedText: normalizeText([first.normalizedText, second.normalizedText].filter(Boolean).join(" ")),
    nameHints: dedupeBy([...(first.nameHints || []), ...(second.nameHints || [])], item => normalizeText(item.value)).slice(0, 14),
    mechanics: unique([...(first.mechanics || []), ...(second.mechanics || [])]),
    identifiers: dedupeBy([...(first.identifiers || []), ...(second.identifiers || [])], item => `${item.setCode || ""}|${item.number || ""}|${item.denominator || ""}`).slice(0, 14),
    numbers: unique([...(first.numbers || []), ...(second.numbers || [])].filter(Boolean)),
    denominators: unique([...(first.denominators || []), ...(second.denominators || [])].filter(Boolean)),
    setCodes: unique([...(first.setCodes || []), ...(second.setCodes || [])].filter(Boolean))
  };
}

async function runLightLocalRecognition(canvases) {
  const language = els.language.value === "de" ? "deu+eng" : "eng";
  const worker = await getOcrWorker(language);
  const selected = await chooseBestCanvasAndOrientationLight(worker, canvases);
  copyCanvas(selected.canvas, els.cardCanvas);
  await updatePreviewFromCanvas(selected.canvas);
  const ocr = await recognizeDetailedCardLight(worker, selected.canvas, selected.quick);
  const parsed = parseOcrObservations(ocr.observations);
  return { selected, ocr, parsed };
}

async function chooseBestCanvasAndOrientationLight(worker, canvases) {
  const attempts = [];
  const limited = canvases.slice(0, 2);
  const jobs = [];
  if (limited[0]) jobs.push({ canvas: limited[0], canvasIndex: 0, rotation: 0, temporary: false });
  if (limited[1]) jobs.push({ canvas: limited[1], canvasIndex: 1, rotation: 0, temporary: false });
  if (limited[0]) jobs.push({ canvas: rotateCanvas(limited[0], 180), canvasIndex: 0, rotation: 180, temporary: true });

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const start = 54 + (index / Math.max(1, jobs.length)) * 10;
    const end = 54 + ((index + 1) / Math.max(1, jobs.length)) * 10;
    const quick = await recognizeQuickCard(worker, job.canvas, start, end);
    const parsed = parseOcrObservations(quick.observations);
    const quality = scoreQuickRecognition(parsed, quick.observations);
    attempts.push({ ...job, quick, parsed, quality });
  }

  attempts.sort((a, b) => b.quality - a.quality);
  const best = attempts[0] || {
    canvas: limited[0],
    canvasIndex: 0,
    rotation: 0,
    quick: { observations: [] },
    parsed: createEmptyParsed(),
    quality: 0,
    temporary: false
  };

  for (const attempt of attempts) {
    if (attempt !== best && attempt.temporary) releaseCanvas(attempt.canvas);
  }

  return {
    ...best,
    alternatives: [best.canvas]
  };
}

async function recognizeDetailedCardLight(worker, canvas, quick) {
  const observations = [...(quick?.observations || [])];
  const jobs = [
    { label: "Name oben – exakt", region: { x: 0.095, y: 0.008, width: 0.59, height: 0.125 }, mode: "title", psm: "7", preprocessing: "local-contrast" },
    { label: "Name Kopfzeile – erweitert", region: { x: 0.02, y: 0.0, width: 0.91, height: 0.18 }, mode: "title", psm: "11", preprocessing: "local-contrast" },
    { label: "Nummer Galerie/Promo – exakt", region: { x: 0.012, y: 0.878, width: 0.63, height: 0.115 }, mode: "number", psm: "7", preprocessing: "local-contrast" },
    { label: "Nummer Galerie/Promo – binär", region: { x: 0.012, y: 0.892, width: 0.63, height: 0.095 }, mode: "number", psm: "7", preprocessing: "local-binary" },
    { label: "Nummer Fußzeile – erweitert", region: { x: 0.005, y: 0.82, width: 0.91, height: 0.175 }, mode: "number", psm: "11", preprocessing: "local-contrast" },
    { label: "Mechanik / Kontext", region: { x: 0.02, y: 0.74, width: 0.96, height: 0.25 }, mode: "mechanic", psm: "11", preprocessing: "local-contrast" }
  ];

  for (let index = 0; index < jobs.length; index += 1) {
    const start = 64 + (index / jobs.length) * 10;
    const end = 64 + ((index + 1) / jobs.length) * 10;
    observations.push(await recognizeRegion(worker, canvas, {
      ...jobs[index],
      progressStart: start,
      progressEnd: end
    }));
  }

  return { observations };
}

async function chooseBestCanvasAndOrientation(worker, canvases) {
  const attempts = [];
  const limited = canvases.slice(0, 5);
  let completed = 0;
  const total = limited.length * 2;

  for (let canvasIndex = 0; canvasIndex < limited.length; canvasIndex += 1) {
    for (const rotation of [0, 180]) {
      const canvas = rotation ? rotateCanvas(limited[canvasIndex], rotation) : limited[canvasIndex];
      const start = 10 + (completed / total) * 25;
      const end = 10 + ((completed + 1) / total) * 25;
      const quick = await recognizeQuickCard(worker, canvas, start, end);
      const parsed = parseOcrObservations(quick.observations);
      const quality = scoreQuickRecognition(parsed, quick.observations);
      attempts.push({ canvas, canvasIndex, rotation, quick, parsed, quality });
      completed += 1;

      if (quality >= 205 && parsed.identifiers[0]?.denominator && parsed.nameHints.length) {
        const sorted = attempts.sort((a, b) => b.quality - a.quality);
        return { ...sorted[0], alternatives: sorted.slice(0, 3).map(item => item.canvas) };
      }
    }
  }

  const sorted = attempts.sort((a, b) => b.quality - a.quality);
  return sorted[0]
    ? { ...sorted[0], alternatives: sorted.slice(0, 3).map(item => item.canvas) }
    : { canvas: limited[0], canvasIndex: 0, rotation: 0, quick: { observations: [] }, parsed: {}, quality: 0, alternatives: [limited[0]] };
}

async function recognizeQuickCard(worker, canvas, start, end) {
  const observations = [];
  const first = start + (end - start) * 0.46;

  observations.push(await recognizeRegion(worker, canvas, {
    label: "Schnelltest Name – exakt",
    region: { x: 0.095, y: 0.008, width: 0.59, height: 0.125 },
    mode: "title",
    psm: "7",
    preprocessing: "local-contrast",
    progressStart: start,
    progressEnd: first
  }));

  observations.push(await recognizeRegion(worker, canvas, {
    label: "Schnelltest Nummer – Galerie/Promo",
    region: { x: 0.012, y: 0.878, width: 0.63, height: 0.115 },
    mode: "number",
    psm: "7",
    preprocessing: "local-contrast",
    progressStart: first,
    progressEnd: end
  }));

  return { observations };
}

async function recognizeDetailedCard(worker, canvas, quick) {
  const observations = [...(quick?.observations || [])];
  const jobs = [
    { label: "Name Kopfzeile", region: { x: 0.025, y: 0.0, width: 0.95, height: 0.155 }, mode: "title", psm: "11" },
    { label: "Name Standard", region: { x: 0.105, y: 0.012, width: 0.70, height: 0.105 }, mode: "title", psm: "7" },
    { label: "Name Spezialkarte – Lokal-Kontrast", region: { x: 0.105, y: 0.018, width: 0.69, height: 0.105 }, mode: "title", psm: "7", preprocessing: "local-contrast" },
    { label: "Mega-/Entwicklungszeile", region: { x: 0.16, y: 0.095, width: 0.80, height: 0.145 }, mode: "context", psm: "11", preprocessing: "local-contrast" },
    { label: "Name Trainer/Full-Art", region: { x: 0.035, y: 0.018, width: 0.93, height: 0.235 }, mode: "title", psm: "11" },
    { label: "Nummer Sammlerzeile – Lokal-Kontrast", region: { x: 0.015, y: 0.885, width: 0.60, height: 0.105 }, mode: "number", psm: "11", preprocessing: "local-contrast" },
    { label: "Nummer Fußzeile", region: { x: 0.015, y: 0.895, width: 0.72, height: 0.10 }, mode: "number", psm: "11" },
    { label: "Nummer Unterkante – Lokal-Kontrast", region: { x: 0.005, y: 0.82, width: 0.99, height: 0.175 }, mode: "number", psm: "11", preprocessing: "local-contrast" },
    { label: "Regelbox / Kartenmechanik", region: { x: 0.015, y: 0.805, width: 0.97, height: 0.175 }, mode: "mechanic", psm: "11", preprocessing: "local-contrast" }
  ];

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    const start = 36 + (index / jobs.length) * 31;
    const end = 36 + ((index + 1) / jobs.length) * 31;
    const observation = await recognizeRegion(worker, canvas, {
      ...job,
      progressStart: start,
      progressEnd: end
    });
    observations.push(observation);

    // Nur schwache Standardauswertungen erhalten eine weitere Variante. Jobs,
    // die bereits lokal normalisiert wurden, werden nicht doppelt gerechnet.
    if (!job.preprocessing && (observation.confidence < 48 || observation.text.trim().length < 4)) {
      const retry = await recognizeRegion(worker, canvas, {
        ...job,
        label: `${job.label} – Lokal-Kontrast`,
        preprocessing: "local-contrast",
        progressStart: Math.max(start, end - 1),
        progressEnd: end
      });
      observations.push(retry);
    }

    if ((observation.confidence < 25 || observation.text.trim().length < 2) && /Nummer/.test(job.label)) {
      const binaryRetry = await recognizeRegion(worker, canvas, {
        ...job,
        label: `${job.label} – Schwarzweiß`,
        preprocessing: "local-binary",
        progressStart: Math.max(start, end - 0.5),
        progressEnd: end
      });
      observations.push(binaryRetry);
    }
  }

  return { observations };
}

async function recognizeRegion(worker, canvas, options) {
  const crop = createProcessedCrop(canvas, options.region, options.mode, options.preprocessing || "gray");
  ocrProgressStage = {
    title: `${options.label} wird gelesen …`,
    start: options.progressStart,
    end: options.progressEnd
  };

  const whitelist = options.mode === "number"
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/| -"
    : options.mode === "mechanic" || options.mode === "context"
      ? "ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜabcdefghijklmnopqrstuvwxyzäöüß0123456789/|€- "
      : "";

  await worker.setParameters({
    tessedit_pageseg_mode: options.psm,
    tessedit_char_whitelist: whitelist,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });

  try {
    const result = await worker.recognize(crop);
    return {
      label: options.label,
      mode: options.mode,
      text: result?.data?.text || "",
      confidence: Number(result?.data?.confidence || 0),
      region: options.region
    };
  } finally {
    releaseCanvas(crop);
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

function createProcessedCrop(source, region, mode, preprocessing) {
  const sx = Math.max(0, Math.round(source.width * region.x));
  const sy = Math.max(0, Math.round(source.height * region.y));
  const sw = Math.max(1, Math.min(source.width - sx, Math.round(source.width * region.width)));
  const sh = Math.max(1, Math.min(source.height - sy, Math.round(source.height * region.height)));
  const targetWidth = mode === "number" ? 1500 : mode === "mechanic" || mode === "context" ? 1150 : 1200;
  const targetHeight = Math.max(180, Math.round(sh * targetWidth / sw));
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;
  let gray = new Uint8Array(targetWidth * targetHeight);
  let minimum = 255;
  let maximum = 0;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    let value;
    if (preprocessing === "dark-channel") value = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    else if (preprocessing === "red-channel") value = pixels[i];
    else if (preprocessing === "green-channel") value = pixels[i + 1];
    else if (preprocessing === "blue-channel") value = pixels[i + 2];
    else if (preprocessing === "saturation") {
      const max = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
      const min = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      value = max === 0 ? 0 : Math.round((max - min) * 255 / max);
    } else {
      value = Math.round(0.22 * pixels[i] + 0.70 * pixels[i + 1] + 0.08 * pixels[i + 2]);
    }
    gray[p] = value;
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }

  if (preprocessing === "local-contrast" || preprocessing === "local-binary") {
    // Eine lokale Helligkeitsnormalisierung entfernt Holo-Verläufe, Regenbogen-
    // Glanz und dunkle Full-Art-Hintergründe, ohne die kleinen Ziffern am
    // Kartenrand zu zerstören. Das ist besonders wichtig bei Mega-/ex-Karten.
    const radius = mode === "number" ? 22 : 18;
    gray = applyLocalContrast(gray, targetWidth, targetHeight, radius, 45);
    minimum = 0;
    maximum = 255;
  }

  const span = Math.max(35, maximum - minimum);
  const threshold = preprocessing === "binary" || preprocessing === "local-binary" ? otsuThreshold(gray) : null;
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    let value = preprocessing === "local-contrast" || preprocessing === "local-binary"
      ? gray[p]
      : Math.round((gray[p] - minimum) * 255 / span);
    if (preprocessing !== "local-contrast" && preprocessing !== "local-binary") {
      value = Math.max(0, Math.min(255, (value - 128) * 1.18 + 128));
    }
    if (threshold !== null) value = gray[p] > threshold ? 255 : 0;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function applyLocalContrast(gray, width, height, radius = 18, contrastScale = 45) {
  const stride = width + 1;
  const integral = new Float32Array((width + 1) * (height + 1));
  const integralSquared = new Float32Array((width + 1) * (height + 1));

  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    let rowSquared = 0;
    const sourceOffset = (y - 1) * width;
    const integralOffset = y * stride;
    const previousOffset = (y - 1) * stride;
    for (let x = 1; x <= width; x += 1) {
      const value = gray[sourceOffset + x - 1];
      rowSum += value;
      rowSquared += value * value;
      integral[integralOffset + x] = integral[previousOffset + x] + rowSum;
      integralSquared[integralOffset + x] = integralSquared[previousOffset + x] + rowSquared;
    }
  }

  const output = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - radius);
    const y2 = Math.min(height - 1, y + radius);
    const top = y1 * stride;
    const bottom = (y2 + 1) * stride;
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - radius);
      const x2 = Math.min(width - 1, x + radius);
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum = integral[bottom + x2 + 1] - integral[top + x2 + 1] - integral[bottom + x1] + integral[top + x1];
      const sumSquared = integralSquared[bottom + x2 + 1] - integralSquared[top + x2 + 1] - integralSquared[bottom + x1] + integralSquared[top + x1];
      const mean = sum / area;
      const variance = Math.max(25, sumSquared / area - mean * mean);
      const normalized = 128 + (gray[y * width + x] - mean) * contrastScale / Math.sqrt(variance);
      output[y * width + x] = Math.max(0, Math.min(255, Math.round(normalized)));
    }
  }
  return output;
}

function parseOcrObservations(observations) {
  const titleHints = extractNameHints(observations.filter(item => item.mode === "title"));
  const contextHints = extractContextNameHints(observations.filter(item => item.mode === "context" || item.mode === "mechanic"));
  const mechanics = extractMechanics(observations);
  const nameHints = mergeNameHints(titleHints, contextHints, mechanics);
  const identifiers = extractCardIdentifiers(observations.filter(item => item.mode === "number" || item.mode === "mechanic"));
  const rawText = observations.map(item => `[${item.label} · ${Math.round(item.confidence)} %]\n${item.text.trim()}`).join("\n\n");

  return {
    rawText,
    normalizedText: normalizeText(rawText),
    nameHints,
    mechanics,
    identifiers,
    numbers: unique(identifiers.map(item => item.number).filter(Boolean)),
    denominators: unique(identifiers.map(item => item.denominator).filter(Boolean)),
    setCodes: unique(identifiers.map(item => item.setCode).filter(Boolean))
  };
}

function extractContextNameHints(observations) {
  const candidates = [];
  const add = (value, score, observation, sourceSuffix) => {
    const cleaned = cleanOcrLine(value)
      .replace(/[^A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\- ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 4 || cleaned.length > 28) return;
    candidates.push({
      value: cleaned,
      score: score + observation.confidence * 0.45,
      confidence: observation.confidence,
      source: `${observation.label}${sourceSuffix ? ` – ${sourceSuffix}` : ""}`
    });
  };

  for (const observation of observations) {
    const text = observation.text.replace(/\s+/g, " ");
    const patterns = [
      /mega[-\s]*(?:entwickelte|entwickelten|entwicklung(?:s)?)[-\s]*(?:form)?\s*(?:von|des)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\-]{3,})/gi,
      /mega[-\s]*(?:evolved|evolution)\s*(?:form)?\s*(?:of|from)\s+([A-Z][A-Za-z'\-]{3,})/gi,
      /(?:form|forme)\s+(?:von|of|de)\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\-]{3,})/gi
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) add(match[1], 132, observation, "Mega-Basisname");
    }

    // OCR trennt „Die Mega-entwickelte Form / von Stalobor“ häufig auf zwei
    // Zeilen. Sobald der Mega-Kontext vorhanden ist, darf ein „von X“-Fragment
    // als Basisname verwendet werden; Evolutionszeilen ohne Mega-Bezug bleiben
    // ausgeschlossen, damit nicht versehentlich Rotomurf statt Stalobor gewinnt.
    if (/mega/i.test(text)) {
      for (const match of text.matchAll(/\bvon\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\-]{3,})/g)) {
        add(match[1], 118, observation, "Mega-von-Zeile");
      }
      for (const match of text.matchAll(/\bof\s+([A-Z][A-Za-z'\-]{3,})/g)) {
        add(match[1], 118, observation, "Mega-of-Zeile");
      }
    }
  }
  return candidates;
}

function extractMechanics(observations) {
  const mechanics = [];
  const add = value => { if (!mechanics.includes(value)) mechanics.push(value); };

  for (const observation of observations) {
    const confidence = Number(observation.confidence || 0);
    if (confidence < 34) continue;
    const text = String(observation.text || "")
      .replace(/[€£]/g, "e")
      .replace(/[—–_]/g, "-")
      .toLowerCase();

    if (/\bmega\b|mega[-\s]*(?:entwick|evol)/i.test(text)) add("mega");
    if (/pok[eé]mon[-\s]*(?:e?x)|\bex[-\s]*(?:regel|rule)|\b[a-zäöüß'\-]{3,}\s+ex\b/i.test(text)) add("ex");
    if (/pok[eé]mon[-\s]*gx|gx[-\s]*(?:regel|rule)|\b[a-zäöüß'\-]{3,}\s+gx\b/i.test(text)) add("gx");
    if (/\bvmax\b/i.test(text)) add("vmax");
    if (/\bvstar\b|v[-\s]*star/i.test(text)) add("vstar");
    if (/v[-\s]*union/i.test(text)) add("v-union");
    if (/tag[-\s]*team/i.test(text)) add("tag-team");
    if (/\bbreak\b/i.test(text)) add("break");
    if (/strahlend|radiant/i.test(text)) add("radiant");
    if (/gl[aä]nzend|shining/i.test(text)) add("shining");
  }
  return mechanics;
}

function mergeNameHints(titleHints, contextHints, mechanics) {
  const candidates = [...contextHints, ...titleHints];
  const expanded = [];
  for (const item of candidates) {
    expanded.push(item);
    const base = stripCardMechanics(item.value);
    if (base && normalizeText(base) !== normalizeText(item.value)) {
      expanded.push({ ...item, value: base, score: item.score + 16, source: `${item.source} – Basisname` });
    }
    if (base && mechanics.includes("mega")) {
      expanded.push({ ...item, value: `Mega-${base} ex`, score: item.score + 46, source: `${item.source} – Mega/ex kombiniert` });
      expanded.push({ ...item, value: `Mega ${base} ex`, score: item.score + 39, source: `${item.source} – Mega/ex Variante` });
    } else if (base && mechanics.includes("ex")) {
      expanded.push({ ...item, value: `${base} ex`, score: item.score + 28, source: `${item.source} – ex kombiniert` });
    }
  }

  return expanded
    .sort((a, b) => b.score - a.score)
    .filter((item, index, array) => array.findIndex(other => normalizeText(other.value) === normalizeText(item.value)) === index)
    .slice(0, 12);
}

function extractNameHints(observations) {
  const rejectPatterns = [
    /entwickelt\s+sich\s+aus/i,
    /evolves?\s+from/i,
    /schw[aä]che|resistenz|r[uü]ckzug|f[aä]higkeit|schaden/i,
    /weakness|resistance|retreat|ability|damage/i,
    /illustrator|illustration|copyright|pokemon\/nintendo/i,
    /wirf|lege|deines\s+gegners|angriff|energie/i,
    /during|opponent|attack|energy/i,
    /größe|gewicht|height|weight/i,
    /^usions?$/i,
    /fusions?[-\s]*angriff|fusion[-\s]*strike/i,
    /fließender[-\s]*angriff|fliessender[-\s]*angriff|rapid[-\s]*strike/i,
    /einzel[-\s]*angriff|single[-\s]*strike/i
  ];

  const stopWords = new Set([
    "basic", "basis", "stage", "phase", "pokemon", "pokémon", "trainer", "energy", "energie",
    "ability", "fähigkeit", "attack", "schaden", "damage", "weakness", "resistance", "retreat",
    "schwäche", "resistenz", "rückzug", "illus", "illustrator", "level", "item", "supporter",
    "unterstützer", "stadium", "regel", "rule", "hp", "kp", "ex", "gx", "vmax", "vstar"
  ]);

  const candidates = [];
  for (const observation of observations) {
    for (const rawLine of observation.text.split(/\r?\n/)) {
      const original = cleanOcrLine(rawLine);
      if (!original || rejectPatterns.some(pattern => pattern.test(original))) continue;
      if (observation.confidence < 35 && !/exakt|Name Standard/i.test(observation.label)) continue;

      const line = original
        .replace(/\b(?:PHASE|STAGE)\s*[12I]\b/gi, " ")
        .replace(/\b(?:BASIC|BASIS)\b/gi, " ")
        .replace(/\b(?:HP|KP)\s*[0-9O]{1,3}\b/gi, " ")
        .replace(/\b[0-9O]{2,3}\s*(?:HP|KP)\b/gi, " ")
        .replace(/[0-9/\\()[\]{}<>©®™_*+=:;,.!?]/g, " ")
        .replace(/[^A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\- ]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (line.length < 3 || line.length > 38) continue;
      const words = normalizeText(line).split(" ").filter(Boolean);
      if (!words.length || words.length > 5) continue;
      const useful = words.filter(word => word.length >= 3 && !stopWords.has(word));
      if (!useful.length) continue;
      if (words.length > 1 && !words.some(word => word.length >= 4)) continue;
      if (/(.)\1\1/i.test(line)) continue;

      let score = observation.confidence * 0.8 + 35;
      if (words.length === 1) score += 42;
      else if (words.length === 2) score += 27;
      else if (words.length > 3) score -= (words.length - 3) * 15;
      if (/^[A-ZÄÖÜ][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ'\-]+(?:\s+[A-ZÄÖÜ0-9][A-Za-zÄÖÜäöüßÉéÈèÀàÁáÂâÇçÑñ0-9'\-]+)*$/.test(line)) score += 18;
      if (/standard/i.test(observation.label)) score += 14;
      if (/oben – exakt/i.test(observation.label)) score += 34;
      if (/schnelltest/i.test(observation.label)) score += 5;
      score += Math.min(22, line.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length * 0.7);
      candidates.push({ value: line, score, confidence: observation.confidence, source: observation.label });

      // Bei OCR-Randfragmenten wie „one Xerneas oT“ ist das längste Wort oft
      // bereits der vollständige Kartenname. Es wird als zusätzlicher, höher
      // gewichteter Suchhinweis aufgenommen, ohne saubere Mehrwortnamen zu
      // verwerfen.
      if (words.length > 1) {
        const originalWords = line.split(/\s+/).filter(Boolean);
        const longest = [...originalWords].sort((a, b) => b.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length - a.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length)[0];
        const longestNormalized = normalizeText(longest);
        if (longestNormalized.length >= 5 && !stopWords.has(longestNormalized)) {
          candidates.push({ value: longest, score: score + 28, confidence: observation.confidence, source: `${observation.label} – Einzelwort` });
        }
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item, index, array) => array.findIndex(other => normalizeText(other.value) === normalizeText(item.value)) === index)
    .slice(0, 8);
}

function extractCardIdentifiers(observations) {
  const candidates = [];
  const add = (number, denominator, setCode, score, source, raw, reliability = null, kind = "generic") => {
    const denominatorDigits = String(denominator || "").toUpperCase().replace(/O/g, "0").replace(/\s+/g, "").replace(/[^0-9]/g, "");
    const denominatorValue = denominatorDigits ? Number(denominatorDigits) : null;
    if (denominatorDigits && (!Number.isFinite(denominatorValue) || denominatorValue < 10 || denominatorValue > 999)) return;

    let normalizedNumber = normalizeCollectorNumber(number);
    if (!normalizedNumber && denominatorValue) {
      const compact = String(number || "").toUpperCase().replace(/O/g, "0").replace(/[^A-Z0-9]/g, "");
      const match = compact.match(/^([A-Z]*)(\d{4})$/);
      if (match) {
        const tail = match[2].slice(-3);
        const tailValue = Number(tail);
        if (tailValue > 0 && tailValue <= denominatorValue + 100) {
          normalizedNumber = `${match[1]}${tail}`;
          score -= 18;
        }
      }
    }
    if (!normalizedNumber) return;

    const numericNumber = Number(normalizedNumber.replace(/^[A-Z]+/, ""));
    if (denominatorValue && Number.isFinite(numericNumber) && numericNumber > denominatorValue + 200) return;

    const rawText = String(raw || "");
    const alphaPrefix = normalizedNumber.match(/^[A-Z]+/)?.[0] || "";
    const looksCopyright = /©|POK[EÉ]MON|NINTENDO|CREATURES|GAME\s*FREAK|\b20(?:0\d|1\d|2\d)\b/i.test(rawText);
    if (!alphaPrefix && denominatorValue >= 19 && denominatorValue <= 29 && looksCopyright) return;
    if (!alphaPrefix && numericNumber >= 1995 && numericNumber <= 2035) return;

    const calculatedReliability = reliability ?? Math.max(0.15, Math.min(0.86, (score - 80) / 150));
    candidates.push({
      number: normalizedNumber,
      denominator: denominatorValue,
      setCode: normalizeSetCode(setCode),
      score,
      reliability: Math.max(0, Math.min(1, calculatedReliability)),
      kind,
      source,
      raw: rawText
    });
  };

  const spacedDigits = "[0-9O](?:\\s*[0-9O]){0,3}";
  const denominatorDigits = "[0-9O](?:\\s*[0-9O]){1,2}";

  for (const observation of observations) {
    const baseScore = observation.confidence * 0.55;
    const lines = observation.text.toUpperCase()
      .split(/\r?\n/)
      .map(line => line.replace(/[\\]/g, "/").replace(/[—–]/g, "-").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const line of lines) {
      const normalizedOcr = line.replace(/(?<=\d)O|O(?=\d)/g, "0");

      // Trainer Gallery und Galarian Gallery drucken das Präfix auf beiden
      // Seiten des Schrägstrichs: TG07/TG30 bzw. GG20/GG70.
      for (const match of normalizedOcr.matchAll(/\b(TG|GG)\s*([0-9]{1,3})\s*[\/|IL]\s*(?:TG|GG)\s*([0-9]{1,3})\b/g)) {
        add(`${match[1]}${match[2]}`, match[3], "", baseScore + 220, observation.label, line, 0.98, "gallery");
      }

      // Black-Star-Promos besitzen häufig keinen Schrägstrich.
      for (const match of normalizedOcr.matchAll(/\b(SVP|SWSH|SM|XY|BW)\s*(?:DE|EN)?\s*[- ]?\s*([0-9]{1,4})\b/g)) {
        add(`${match[1]}${match[2]}`, "", "", baseScore + 190, observation.label, line, 0.96, "promo");
      }

      const copyrightLine = /©|POK[EÉ]MON|NINTENDO|CREATURES|GAME\s*FREAK|\b20(?:0\d|1\d|2\d)\b/i.test(line);
      if (copyrightLine) continue;

      const withLanguage = new RegExp(`\\b([A-Z][A-Z0-9]{1,5})\\s+(?:DE|EN|FR|IT|ES|PT|OF|0F|OE|DF)\\s+([A-Z]*${spacedDigits})\\s*[\\/|IL]\\s*(${denominatorDigits})(?=$|[^0-9])`, "g");
      const withoutLanguage = new RegExp(`\\b([A-Z][A-Z0-9]{1,5})\\s+([A-Z]*${spacedDigits})\\s*[\\/|IL]\\s*(${denominatorDigits})(?=$|[^0-9])`, "g");
      const genericSlash = new RegExp(`(?:^|[^A-Z0-9])([A-Z]*${spacedDigits})\\s*[\\/|IL]\\s*(${denominatorDigits})(?=$|[^0-9])`, "g");

      for (const match of line.matchAll(withLanguage)) add(match[2], match[3], match[1], baseScore + 150, observation.label, line, 0.88, "set-number");
      for (const match of line.matchAll(withoutLanguage)) add(match[2], match[3], match[1], baseScore + 137, observation.label, line, 0.78, "set-number");
      for (const match of line.matchAll(genericSlash)) add(match[1], match[2], "", baseScore + 112, observation.label, line, observation.confidence >= 55 ? 0.72 : 0.42, "slash");

      for (const match of normalizedOcr.matchAll(/(?:^|[^A-Z0-9])([0-9]{2,4})\s+([0-9]{2,3})(?=$|[^A-Z0-9])/g)) {
        const numerator = Number(normalizeCollectorNumber(match[1]).replace(/^[A-Z]+/, ""));
        const denominator = Number(match[2]);
        if (numerator > 0 && denominator >= 20 && numerator <= denominator + 100) {
          add(match[1], match[2], "", baseScore + 82, observation.label, line, 0.38, "spaced");
        }
      }

      const likelySetCode = line.match(/\b(?!DE\b|EN\b|FR\b|IT\b|ES\b|PT\b)([A-Z][A-Z0-9]{1,5})\b/)?.[1] || "";
      for (const runMatch of normalizedOcr.matchAll(/\d{5,12}/g)) {
        const run = runMatch[0];
        for (let start = 0; start <= Math.min(3, run.length - 4); start += 1) {
          for (const numberLength of [3, 2, 4]) {
            for (const gap of [0, 1, 2]) {
              for (const denominatorLength of [3, 2]) {
                const numberRaw = run.slice(start, start + numberLength);
                const denominatorRaw = run.slice(start + numberLength + gap, start + numberLength + gap + denominatorLength);
                if (numberRaw.length !== numberLength || denominatorRaw.length !== denominatorLength) continue;
                const normalizedNumber = normalizeCollectorNumber(numberRaw);
                const numericNumber = Number(normalizedNumber.replace(/^[A-Z]+/, ""));
                const denominator = Number(denominatorRaw);
                if (!normalizedNumber || denominator < 20 || denominator > 399 || numericNumber < 1 || numericNumber > denominator + 100) continue;
                let compactScore = baseScore + 48;
                if (numberRaw.startsWith("0")) compactScore += 32;
                if (numberLength === 3) compactScore += 14;
                else if (numberLength === 2) compactScore -= 8;
                if (denominator >= 100) compactScore += 18;
                if (denominator > 300) compactScore -= 20;
                compactScore += gap === 0 ? 18 : gap === 1 ? 10 : 3;
                compactScore -= start * 3;
                if (likelySetCode) compactScore += 10;
                add(numberRaw, denominatorRaw, likelySetCode, compactScore, observation.label, line, 0.28, "compact");
              }
            }
          }
        }
      }
    }
  }

  return candidates
    .sort((a, b) => (b.reliability - a.reliability) || (b.score - a.score))
    .filter((item, index, array) => array.findIndex(other =>
      collectorNumbersEqual(other.number, item.number)
      && other.denominator === item.denominator
      && other.setCode === item.setCode
    ) === index)
    .slice(0, 10);
}

function scoreQuickRecognition(parsed, observations) {
  let score = 0;
  if (parsed.nameHints[0]) score += Math.min(100, parsed.nameHints[0].score);
  if (parsed.identifiers[0]) score += Math.min(135, parsed.identifiers[0].score) * (parsed.identifiers[0].reliability ?? 0.5);
  if (parsed.identifiers[0]?.denominator && (parsed.identifiers[0].reliability ?? 0) >= 0.65) score += 48;
  if (parsed.identifiers[0]?.setCode && (parsed.identifiers[0].reliability ?? 0) >= 0.65) score += 20;
  if (parsed.mechanics?.length) score += 10;
  score += observations.reduce((sum, item) => sum + Math.max(0, item.confidence - 40) * 0.08, 0);
  return score;
}

async function manualSearch() {
  const name = els.manualName.value.trim();
  const manualIdentifier = parseManualIdentifier(els.manualNumber.value);
  if (!name && !manualIdentifier.number) {
    showError("Bitte gib mindestens einen Kartennamen oder eine Kartennummer ein.");
    return;
  }

  setBusy(true);
  clearResults();
  setSyncWorkingState();
  try {
    const parsed = {
      rawText: `${name}\n${els.manualNumber.value}`,
      normalizedText: normalizeText(`${name} ${els.manualNumber.value}`),
      nameHints: name ? [{ value: name, score: 100, confidence: 100, source: "manuell" }] : [],
      mechanics: extractMechanics([{ text: name, mode: "manual", confidence: 100, label: "Manuell" }]),
      identifiers: manualIdentifier.number ? [{ ...manualIdentifier, score: 300, reliability: 1, kind: "manual", source: "manuell", raw: els.manualNumber.value }] : [],
      numbers: manualIdentifier.number ? [manualIdentifier.number] : [],
      denominators: manualIdentifier.denominator ? [manualIdentifier.denominator] : [],
      setCodes: manualIdentifier.setCode ? [manualIdentifier.setCode] : []
    };
    lastParsed = parsed;
    setProgress("Kartendatenbank wird durchsucht …", 30);
    const candidates = await findCandidates(parsed, els.language.value);
    setProgress("Treffer werden sortiert …", 70);
    const ranked = await rankCandidates(candidates, parsed, els.language.value, null);
    setProgress("Preise werden geladen …", 90);
    const enriched = await enrichTopCandidates(ranked, els.language.value);
    renderResults(enriched, parsed);
    setSyncSuccessState();
    setScanState(getAiEndpoint() ? "green" : "off", false, getAiEndpoint() ? "KI BEREIT" : "KI AUS");
    setProgress("Fertig", 100);
  } catch (error) {
    console.error(error);
    setSyncErrorState();
    showError("Die Kartensuche ist gerade nicht erreichbar. Bitte versuche es erneut.");
  } finally {
    setTimeout(() => setBusy(false), 250);
  }
}

async function findCandidates(parsed, language) {
  const candidateMap = new Map();
  const selectedLanguage = language || "de";
  const searchLanguages = selectedLanguage === "en" ? ["en"] : [selectedLanguage, "en"];
  const tasks = [];

  for (const dataLanguage of searchLanguages) {
    for (const number of parsed.numbers.slice(0, 4)) {
      for (const variant of numberVariants(number)) {
        tasks.push(fetchCards(dataLanguage, { localId: `eq:${variant}` }, 300));
      }
    }

    // Namenssuchen werden in der gewählten Sprache priorisiert. Die englische
    // Rückfallebene ist vor allem für brandneue Sets gedacht, bei denen die
    // deutsche Datenbankkarte noch nicht verfügbar ist; die Nummernsuche bleibt
    // dort sprachunabhängig besonders wertvoll.
    if (dataLanguage === selectedLanguage || selectedLanguage === "en") {
      for (const hint of parsed.nameHints.slice(0, 6)) {
        for (const variant of nameSearchVariants(hint.value, parsed.mechanics)) {
          tasks.push(fetchCards(dataLanguage, { name: variant }, 180));
        }
      }
    }
  }

  if (!tasks.length) return [];
  const responses = await Promise.allSettled(tasks);
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const card of response.value) {
      const key = String(card.id || `${card._dataLanguage}-${card.localId}-${card.name}`);
      const existing = candidateMap.get(key);
      if (!existing || (existing._dataLanguage !== selectedLanguage && card._dataLanguage === selectedLanguage)) {
        candidateMap.set(key, card);
      }
    }
  }

  let candidates = [...candidateMap.values()];
  const setMapEntries = await Promise.all(searchLanguages.map(async dataLanguage => {
    try { return [dataLanguage, await getSetsMap(dataLanguage)]; }
    catch { return [dataLanguage, new Map()]; }
  }));
  const setsByLanguage = new Map(setMapEntries);

  candidates = candidates.map(card => {
    const setId = cardSetId(card);
    const set = setsByLanguage.get(card._dataLanguage)?.get(setId);
    return { ...card, _setId: setId, _setBrief: set || null };
  });

  const denominator = parsed.identifiers[0]?.denominator;
  if (denominator) {
    const exact = candidates.filter(card => Number(card._setBrief?.cardCount?.official) === Number(denominator));
    if (exact.length) candidates = exact;
  }

  const setCodes = parsed.setCodes.flatMap(setCodeVariants).filter(Boolean);
  if (setCodes.length) {
    const matching = candidates.filter(card => setCodes.some(code => setCodeMatchesCard(code, card)));
    if (matching.length) candidates = matching;
  }

  return candidates;
}

async function fetchCards(language, filters, limit = 100) {
  const params = new URLSearchParams(filters);
  params.set("pagination:page", "1");
  params.set("pagination:itemsPerPage", String(limit));
  const response = await fetch(`${API_BASE}/${language}/cards?${params.toString()}`);
  if (!response.ok) throw new Error(`TCGdex-Suche fehlgeschlagen: ${response.status}`);
  const json = await response.json();
  return (Array.isArray(json) ? json : []).map(card => ({ ...card, _dataLanguage: language }));
}

async function getSetsMap(language) {
  const storageKey = `cardscan-sets-${language}-v1`;
  try {
    const cached = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (cached?.savedAt && Date.now() - cached.savedAt < 7 * 24 * 60 * 60 * 1000 && Array.isArray(cached.sets)) {
      return new Map(cached.sets.map(set => [set.id, set]));
    }
  } catch {
    // Defekten Cache ignorieren.
  }

  const response = await fetch(`${API_BASE}/${language}/sets`);
  if (!response.ok) throw new Error(`Setliste nicht erreichbar: ${response.status}`);
  const sets = await response.json();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), sets }));
  } catch {
    // Private Browsermodi können localStorage einschränken.
  }
  return new Map((Array.isArray(sets) ? sets : []).map(set => [set.id, set]));
}

async function rankCandidates(candidates, parsed, language, scannedCanvases) {
  if (!candidates.length) return [];
  let ranked = candidates
    .map(card => ({ ...card, _metaScore: scoreCardMetadata(card, parsed), _imageScore: null }))
    .sort((a, b) => b._metaScore - a._metaScore);

  const sourceList = Array.isArray(scannedCanvases) ? scannedCanvases.filter(Boolean) : (scannedCanvases ? [scannedCanvases] : []);
  if (sourceList.length) {
    const sourceDescriptors = sourceList.slice(0, 1).map(createCardDescriptor);
    const pool = ranked.slice(0, MAX_IMAGE_CANDIDATES);
    await mapWithConcurrency(pool, 3, async card => {
      if (!card.image) return;
      try {
        const image = await loadExternalImage(`${card.image}/low.webp`, 8000);
        const candidateCanvas = drawImageToCardCanvas(image);
        try {
          const descriptor = createCardDescriptor(candidateCanvas);
          card._imageScore = Math.max(...sourceDescriptors.map(source => compareCardDescriptors(source, descriptor)));
        } finally {
          releaseCanvas(candidateCanvas);
        }
      } catch {
        card._imageScore = null;
      }
    });
  }

  const recognitionStrength = getRecognitionStrength(parsed);
  const imageWeight = recognitionStrength >= 0.78 ? 270 : recognitionStrength >= 0.48 ? 380 : 500;
  ranked = ranked.map(card => {
    const imageBonus = card._imageScore === null ? 0 : Math.round(card._imageScore * imageWeight);
    return { ...card, _score: card._metaScore + imageBonus };
  });

  return ranked.sort((a, b) => b._score - a._score).slice(0, 14);
}

function getRecognitionStrength(parsed) {
  const identifierStrength = Math.max(0, ...(parsed.identifiers || []).map(item => Number(item.reliability || 0)));
  const nameStrength = Math.max(0, ...(parsed.nameHints || []).map(item => Math.min(1, Number(item.confidence || 0) / 100)));
  return Math.max(identifierStrength, nameStrength * 0.85);
}

function getReliableIdentifierMatch(parsed, card, minimum = 0) {
  return (parsed.identifiers || [])
    .filter(item => Number(item.reliability || 0) >= minimum && collectorNumbersEqual(item.number, card.localId))
    .sort((a, b) => Number(b.reliability || 0) - Number(a.reliability || 0))[0] || null;
}

function scoreCardMetadata(card, parsed) {
  const cardName = normalizeText(card.name || "");
  const cardBaseName = normalizeText(stripCardMechanics(card.name || ""));
  const cardMechanics = mechanicsFromCardName(card.name || "");
  let score = 0;

  const numberMatch = getReliableIdentifierMatch(parsed, card, 0.2);
  if (numberMatch) {
    const reliability = Number(numberMatch.reliability || 0);
    score += Math.round(285 * reliability);
    const officialTotal = Number(card._setBrief?.cardCount?.official || card.set?.cardCount?.official || 0);
    if (numberMatch.denominator && officialTotal === Number(numberMatch.denominator)) {
      score += Math.round(245 * reliability);
    }
  }

  const setCodeMatch = (parsed.identifiers || []).some(identifier =>
    Number(identifier.reliability || 0) >= 0.65
    && identifier.setCode
    && setCodeVariants(identifier.setCode).some(code => setCodeMatchesCard(code, card))
  );
  if (setCodeMatch) score += 115;

  for (const mechanic of parsed.mechanics || []) {
    if (cardMechanics.includes(mechanic)) score += mechanic === "mega" ? 90 : 55;
    else if (mechanic === "ex" && /\bex\b/i.test(cardName)) score += 42;
  }

  for (const hint of parsed.nameHints) {
    const normalizedHint = normalizeText(hint.value);
    const hintBase = normalizeText(stripCardMechanics(hint.value));
    if (!normalizedHint) continue;
    const hintReliability = Math.max(0.25, Math.min(1, Number(hint.confidence || 45) / 100));
    if (cardName === normalizedHint) score += Math.round(270 * hintReliability);
    else if (cardName.includes(normalizedHint) || normalizedHint.includes(cardName)) score += Math.round(190 * hintReliability);
    score += Math.round(similarity(cardName, normalizedHint) * 135 * hintReliability);
    score += Math.round(tokenOverlap(cardName, normalizedHint) * 65 * hintReliability);

    if (hintBase && cardBaseName) {
      if (hintBase === cardBaseName) score += Math.round(235 * hintReliability);
      else if (hintBase.includes(cardBaseName) || cardBaseName.includes(hintBase)) score += Math.round(155 * hintReliability);
      score += Math.round(similarity(cardBaseName, hintBase) * 110 * hintReliability);
    }
  }

  return score;
}

async function enrichTopCandidates(ranked, language) {
  const top = ranked.slice(0, 10);
  const enriched = await mapWithConcurrency(top, 4, async card => {
    try {
      const dataLanguage = card._dataLanguage || language;
      const response = await fetch(`${API_BASE}/${dataLanguage}/cards/${encodeURIComponent(card.id)}`);
      if (!response.ok) return card;
      const full = await response.json();
      let fallbackImage = full.image || card.image || null;

      // Deutsche Datensätze besitzen bei einzelnen Karten noch kein Bild,
      // während dasselbe Karten-ID-Bild in der englischen Datenbank vorhanden
      // sein kann. In diesem Fall wird nur das Bild ergänzt; Name, Preis und
      // sonstige Daten bleiben aus der gewählten Sprache erhalten.
      if (!fallbackImage && dataLanguage !== "en") {
        try {
          const englishResponse = await fetch(`${API_BASE}/en/cards/${encodeURIComponent(card.id)}`);
          if (englishResponse.ok) {
            const englishCard = await englishResponse.json();
            fallbackImage = englishCard.image || null;
          }
        } catch {
          // Fehlendes englisches Bild ist kein Abbruchgrund.
        }
      }

      return {
        ...card,
        ...full,
        image: fallbackImage,
        _dataLanguage: dataLanguage,
        _score: card._score,
        _metaScore: card._metaScore,
        _imageScore: card._imageScore
      };
    } catch {
      return card;
    }
  });
  return enriched.sort((a, b) => b._score - a._score).slice(0, getResultLimit());
}

function createCardDescriptor(canvas) {
  return {
    full: createImageVector(canvas, { x: 0.035, y: 0.025, width: 0.93, height: 0.95 }, 22, 31, "gray"),
    art: createImageVector(canvas, { x: 0.07, y: 0.12, width: 0.86, height: 0.48 }, 24, 19, "edge"),
    footer: createImageVector(canvas, { x: 0.025, y: 0.73, width: 0.95, height: 0.25 }, 25, 10, "edge"),
    color: createImageVector(canvas, { x: 0.06, y: 0.08, width: 0.88, height: 0.83 }, 10, 14, "color")
  };
}

function createImageVector(canvas, region, columns, rows, mode) {
  const mini = createCanvas(columns, rows);
  const ctx = mini.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    canvas,
    canvas.width * region.x,
    canvas.height * region.y,
    canvas.width * region.width,
    canvas.height * region.height,
    0,
    0,
    columns,
    rows
  );

  try {
    const data = ctx.getImageData(0, 0, columns, rows).data;
    const values = [];

    if (mode === "color") {
      for (let i = 0; i < data.length; i += 4) {
        values.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      }
      return values;
    }

    const gray = [];
    for (let i = 0; i < data.length; i += 4) gray.push((0.22 * data[i] + 0.70 * data[i + 1] + 0.08 * data[i + 2]) / 255);
    if (mode === "gray") return normalizeVector(gray);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const here = gray[y * columns + x];
        const right = gray[y * columns + Math.min(columns - 1, x + 1)];
        const down = gray[Math.min(rows - 1, y + 1) * columns + x];
        values.push(Math.min(1, Math.abs(here - right) + Math.abs(here - down)));
      }
    }
    return normalizeVector(values);
  } finally {
    releaseCanvas(mini);
  }
}

function compareCardDescriptors(a, b) {
  const full = vectorCorrelation(a.full, b.full);
  const art = vectorCorrelation(a.art, b.art);
  const footer = vectorCorrelation(a.footer, b.footer);
  const color = cosineSimilarity(a.color, b.color);
  return clamp01(full * 0.18 + art * 0.42 + footer * 0.30 + color * 0.10);
}

function renderResults(cards, parsed) {
  els.resultPanel.classList.remove("hidden");
  els.results.innerHTML = "";

  if (!cards.length) {
    const recognized = [
      parsed.nameHints[0]?.value ? `Name „${parsed.nameHints[0].value}“` : "",
      parsed.identifiers[0] ? `Nummer ${formatIdentifierForInput(parsed.identifiers[0])}` : ""
    ].filter(Boolean).join(" und ");
    els.resultMessage.className = "notice error";
    els.resultMessage.textContent = recognized
      ? `Keine Datenbankkarte zu ${recognized} gefunden. Bei sehr neuen Sets kann der Datensatz noch fehlen.`
      : "Keine passende Datenbankkarte gefunden. Nutze den Live-Scanner erneut oder trage Name und Nummer manuell ein.";
    const fallbackQuery = buildParsedSearchQuery(parsed);
    if (fallbackQuery) {
      const directLink = document.createElement("a");
      directLink.className = "notice-action";
      directLink.target = "_blank";
      directLink.rel = "noopener noreferrer";
      directLink.href = buildCardmarketSearchUrl(fallbackQuery);
      directLink.textContent = `Trotzdem auf Cardmarket nach „${fallbackQuery}“ suchen`;
      els.resultMessage.append(document.createElement("br"), directLink);
    }
    els.resultMessage.classList.remove("hidden");
    els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const top = cards[0];
  const second = cards[1];
  const margin = second ? top._score - second._score : top._score;
  const confidenceText = getConfidenceText(top, margin, parsed);
  const recognizedParts = [];
  if (parsed.nameHints[0]?.value) recognizedParts.push(parsed.nameHints[0].value);
  const displayIdentifier = (parsed.identifiers || []).find(item => Number(item.reliability || 0) >= 0.55);
  if (displayIdentifier) recognizedParts.push(formatIdentifierForInput(displayIdentifier));

  els.resultMessage.className = "notice";
  els.resultMessage.textContent = `${confidenceText}${recognizedParts.length ? ` Erkannt wurden: ${recognizedParts.join(" · ")}.` : ""} Vergleiche vor dem Kauf zur Sicherheit Kartenbild und Nummer.`;
  els.resultMessage.classList.remove("hidden");

  cards.forEach((card, index) => {
    const article = document.createElement("article");
    article.className = `result-card${index === 0 ? " best-match" : ""}`;

    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = `${card.name || "Pokémon-Karte"} – Kartenabbildung`;
    image.src = card.image ? `${card.image}/low.webp` : "icons/card-placeholder.svg";
    image.onerror = () => { image.src = "icons/card-placeholder.svg"; };

    const info = document.createElement("div");
    info.className = "result-info";
    const title = document.createElement("h3");
    title.textContent = card.name || "Unbekannte Karte";

    const badges = document.createElement("div");
    badges.className = "result-badges";
    const reliableNumberMatch = getReliableIdentifierMatch(parsed, card, 0.65);
    const confidentTop = index === 0 && isConfidentTopMatch(card, margin, parsed);
    if (index === 0) badges.append(createBadge(confidentTop ? "Bester Treffer" : "Ähnlichster Treffer", confidentTop));
    if (card._imageScore !== null && card._imageScore !== undefined) badges.append(createBadge(`Bild ${Math.round(card._imageScore * 100)} %`, card._imageScore >= 0.72));
    if (reliableNumberMatch) badges.append(createBadge("Nummer passt", true));
    if (card._dataLanguage && card._dataLanguage !== els.language.value) badges.append(createBadge("engl. Datenbank-Fallback", false));

    const meta = document.createElement("p");
    meta.className = "result-meta";
    const setName = card.set?.name || card._setBrief?.name || "Set nicht angegeben";
    const officialTotal = card.set?.cardCount?.official || card._setBrief?.cardCount?.official;
    meta.innerHTML = `${escapeHtml(setName)}<br><span class="result-number">Nr. ${escapeHtml(String(card.localId || "–"))}${officialTotal ? `/${escapeHtml(String(officialTotal))}` : ""}</span>`;

    const priceBox = buildPriceBox(card.pricing?.cardmarket);
    const actions = document.createElement("div");
    actions.className = "cardmarket-actions";

    const primaryLink = document.createElement("a");
    primaryLink.className = "cardmarket-button";
    primaryLink.target = "_blank";
    primaryLink.rel = "noopener noreferrer";
    primaryLink.textContent = "Auf Cardmarket öffnen";
    primaryLink.href = buildCardmarketUrl(card, parsed, true);

    const fallbackLink = document.createElement("a");
    fallbackLink.className = "cardmarket-fallback";
    fallbackLink.target = "_blank";
    fallbackLink.rel = "noopener noreferrer";
    fallbackLink.textContent = "Alternative Cardmarket-Suche";
    fallbackLink.href = buildCardmarketUrl(card, parsed, false);

    actions.append(primaryLink, fallbackLink);
    info.append(title, badges, meta);
    if (priceBox) info.append(priceBox);
    info.append(actions);
    article.append(image, info);
    els.results.append(article);
  });

  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildPriceBox(pricing) {
  if (!pricing) return null;
  const values = [
    ["Trend", pricing.trend ?? pricing["trend-holo"]],
    ["ab", pricing.low ?? pricing["low-holo"]],
    ["30 Tage", pricing.avg30 ?? pricing["avg30-holo"]]
  ];
  if (!values.some(([, value]) => Number.isFinite(Number(value)))) return null;

  const box = document.createElement("div");
  box.className = "price-box";
  for (const [label, value] of values) {
    const item = document.createElement("div");
    item.className = "price-item";
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = Number.isFinite(Number(value)) ? formatEuro(Number(value)) : "–";
    item.append(labelElement, valueElement);
    box.append(item);
  }
  return box;
}

function buildCardmarketUrl(card, parsed, precise) {
  // Cardmarket findet Pokémon-Karten am stabilsten über Kartenname plus
  // Sammlernummer. Interne TCGdex-Set-IDs werden nicht mitgesendet, weil die
  // Plattform andere Setkürzel verwenden kann.
  const queryParts = precise
    ? [card.name, normalizeCollectorNumber(card.localId || "")]
    : [card.name];
  return buildCardmarketSearchUrl(queryParts.filter(Boolean).join(" "));
}

function buildParsedSearchQuery(parsed) {
  const number = parsed.identifiers?.[0]?.number || parsed.numbers?.[0] || "";
  const bestName = parsed.nameHints?.find(item => stripCardMechanics(item.value).length >= 4)?.value || parsed.nameHints?.[0]?.value || "";
  const setCode = parsed.identifiers?.[0]?.setCode || "";
  return [bestName, setCode, number].filter(Boolean).join(" ").trim();
}

function buildCardmarketSearchUrl(query) {
  const params = new URLSearchParams({ searchString: String(query || "").trim() });
  return `${CARDMARKET_SEARCH}?${params.toString()}`;
}

function isConfidentTopMatch(top, margin, parsed) {
  const strongImage = Number(top._imageScore) >= 0.72;
  const reliableNumber = Boolean(getReliableIdentifierMatch(parsed, top, 0.72));
  return Boolean(reliableNumber || (strongImage && margin > 35));
}

function getConfidenceText(top, margin, parsed) {
  const strongImage = Number(top._imageScore) >= 0.72;
  const numberMatch = getReliableIdentifierMatch(parsed, top, 0.65);
  const officialTotal = Number(top.set?.cardCount?.official || top._setBrief?.cardCount?.official || 0);
  const denominatorMatch = numberMatch?.denominator && officialTotal === Number(numberMatch.denominator);
  if (numberMatch && denominatorMatch) return "Die erste Karte ist sehr wahrscheinlich der richtige Treffer.";
  if (numberMatch || (strongImage && margin > 35)) return "Die erste Karte ist wahrscheinlich der richtige Treffer.";
  return "Die Erkennung ist nicht eindeutig; bitte wähle anhand des Kartenbildes.";
}

function createBadge(text, strong) {
  const badge = document.createElement("span");
  badge.className = `match-badge${strong ? " strong" : ""}`;
  badge.textContent = text;
  return badge;
}

function formatDebugText(ocr, parsed, selected, aiResult = null) {
  const name = parsed.nameHints[0]?.value || "nicht sicher erkannt";
  const identifier = parsed.identifiers[0] ? formatIdentifierForInput(parsed.identifiers[0]) : "nicht sicher erkannt";
  const blocks = [
    `CardDex AI App v${APP_VERSION}`,
    `KI-Modus: ${getAiEndpoint() ? "verbunden" : "nicht verbunden"}`,
    `KI-Status: ${lastAiDiagnostic.status}`,
    `KI-Details: ${lastAiDiagnostic.detail || "keine"}`,
    `KI-Antwort: ${aiResult ? JSON.stringify(aiResult) : "keine"}`,
    `KI-Datenbankprüfung: ${aiResult?._databaseVerified ? "bestätigt" : aiResult?._numberRejected ? "Nummer verworfen" : "nicht bestätigt"}`,
    `Verwendeter Bildausschnitt: ${selected.canvasIndex + 1}`,
    `Ausrichtung: ${selected.rotation}°`,
    `Schnelltest-Bewertung: ${Math.round(selected.quality)}`,
    `Ermittelter Kartenname: ${name}`,
    `Ermittelte Kennung: ${identifier}`,
    `Kennungszuverlässigkeit: ${parsed.identifiers[0] ? `${Math.round(Number(parsed.identifiers[0].reliability || 0) * 100)} % (${parsed.identifiers[0].kind || "OCR"})` : "–"}`,
    `Erkannte Mechanik: ${parsed.mechanics?.length ? parsed.mechanics.join(", ") : "keine"}`,
    "",
    "--- OCR-Bereiche ---"
  ];
  for (const observation of ocr.observations) {
    blocks.push("", `[${observation.label} · ${Math.round(observation.confidence)} %]`, observation.text.trim() || "Kein Text erkannt.");
  }
  if (parsed.nameHints.length > 1) blocks.push("", "Namenskandidaten:", ...parsed.nameHints.map(item => `- ${item.value} (${Math.round(item.score)})`));
  if (parsed.identifiers.length > 1) blocks.push("", "Nummernkandidaten:", ...parsed.identifiers.map(item => `- ${formatIdentifierForInput(item)} (${Math.round(item.score)})`));
  return blocks.join("\n");
}

function showError(message) {
  setSyncErrorState();
  els.resultPanel.classList.remove("hidden");
  els.resultMessage.className = "notice error";
  els.resultMessage.textContent = message;
  els.resultMessage.classList.remove("hidden");
  els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearResults() {
  els.resultPanel.classList.add("hidden");
  els.debugPanel.classList.add("hidden");
  els.results.innerHTML = "";
  els.resultMessage.className = "notice hidden";
  els.resultMessage.textContent = "";
}

function setBusy(isBusy) {
  els.progressPanel.classList.toggle("hidden", !isBusy);
  if (isBusy) setPowerState("amber", true);
  else setPowerState("green", false);
  els.analyzeButton.disabled = isBusy;
  els.manualSearchButton.disabled = isBusy;
  els.openScannerButton.disabled = isBusy;
  els.cameraInput.disabled = isBusy;
  els.galleryInput.disabled = isBusy;
  if (!isBusy) setProgress("", 0);
}

function setProgress(title, percent) {
  els.progressTitle.textContent = title;
  els.progressText.textContent = `${Math.round(percent)} %`;
  els.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function loadOpenCv(timeoutMs) {
  const resolveCv = async value => {
    const resolved = value && typeof value.then === "function" ? await value : value;
    if (resolved?.Mat) return resolved;
    throw new Error("OpenCV ist nicht bereit.");
  };

  if (window.cv) {
    try { return await promiseWithTimeout(resolveCv(window.cv), timeoutMs); } catch { /* Skript eventuell noch nicht initialisiert. */ }
  }
  if (openCvPromise) {
    try {
      return await promiseWithTimeout(openCvPromise, timeoutMs);
    } catch (error) {
      // Eine beim vorherigen Versuch hängengebliebene Initialisierung darf
      // spätere Galerieimporte nicht dauerhaft blockieren.
      openCvPromise = null;
      throw error;
    }
  }

  openCvPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${OPENCV_URL}"]`);
    const script = existing || document.createElement("script");
    let settled = false;
    const finish = async () => {
      if (settled) return;
      try {
        const cv = await resolveCv(window.cv);
        settled = true;
        resolve(cv);
      } catch {
        if (window.cv && typeof window.cv === "object") {
          window.cv.onRuntimeInitialized = finish;
        } else {
          setTimeout(finish, 60);
        }
      }
    };

    if (!existing) {
      script.async = true;
      script.src = OPENCV_URL;
      script.onerror = () => {
        if (!settled) reject(new Error("OpenCV konnte nicht geladen werden."));
      };
      document.head.append(script);
    }
    script.addEventListener("load", finish, { once: true });
    finish();
  });

  try {
    return await promiseWithTimeout(openCvPromise, timeoutMs);
  } catch (error) {
    openCvPromise = null;
    throw error;
  }
}

function detectAndRectifyCard(sourceCanvas, cv) {
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(sourceCanvas.width, sourceCanvas.height));
  const working = createCanvas(Math.round(sourceCanvas.width * scale), Math.round(sourceCanvas.height * scale));
  working.getContext("2d").drawImage(sourceCanvas, 0, 0, working.width, working.height);

  const src = cv.imread(working);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let best = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    for (const thresholds of [[35, 110], [55, 155], [20, 75]]) {
      cv.Canny(blurred, edges, thresholds[0], thresholds[1]);
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);
      kernel.delete();
      cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      for (let index = 0; index < contours.size(); index += 1) {
        const contour = contours.get(index);
        const areaRatio = cv.contourArea(contour) / (working.width * working.height);
        if (areaRatio < 0.16 || areaRatio > 0.94) {
          contour.delete();
          continue;
        }
        const perimeter = cv.arcLength(contour, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, perimeter * 0.025, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const points = [];
          for (let row = 0; row < 4; row += 1) points.push({ x: approx.intPtr(row, 0)[0], y: approx.intPtr(row, 0)[1] });
          const ordered = orderQuadPoints(points);
          const geometry = scoreQuadGeometry(ordered, working.width, working.height, areaRatio);
          if (!best || geometry.score > best.score) best = { points: ordered, score: geometry.score, areaRatio };
        }
        approx.delete();
        contour.delete();
      }
      if (best?.score > 78) break;
    }

    if (!best || best.score < 48) return null;
    const points = best.points.map(point => ({ x: point.x / scale, y: point.y / scale }));
    return perspectiveWarpCanvas(sourceCanvas, points, cv);
  } finally {
    src.delete(); gray.delete(); blurred.delete(); edges.delete(); closed.delete(); contours.delete(); hierarchy.delete();
  }
}

function perspectiveWarpCanvas(sourceCanvas, points, cv) {
  const src = cv.imread(sourceCanvas);
  const dst = new cv.Mat();
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap(point => [point.x, point.y]));
  const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, CARD_WIDTH - 1, 0, CARD_WIDTH - 1, CARD_HEIGHT - 1, 0, CARD_HEIGHT - 1]);
  const matrix = cv.getPerspectiveTransform(sourcePoints, destinationPoints);
  try {
    cv.warpPerspective(src, dst, matrix, new cv.Size(CARD_WIDTH, CARD_HEIGHT), cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    cv.imshow(canvas, dst);
    return canvas;
  } finally {
    src.delete(); dst.delete(); sourcePoints.delete(); destinationPoints.delete(); matrix.delete();
  }
}

function scoreQuadGeometry(points, width, height, areaRatio) {
  const top = distance(points[0], points[1]);
  const right = distance(points[1], points[2]);
  const bottom = distance(points[2], points[3]);
  const left = distance(points[3], points[0]);
  const averageWidth = (top + bottom) / 2;
  const averageHeight = (left + right) / 2;
  const ratio = Math.min(averageWidth, averageHeight) / Math.max(averageWidth, averageHeight);
  const ratioScore = Math.max(0, 1 - Math.abs(ratio - 2.5 / 3.5) / 0.25);
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / 4;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / 4;
  const centerDistance = Math.hypot(centerX - width / 2, centerY - height / 2) / Math.hypot(width / 2, height / 2);
  const centerScore = Math.max(0, 1 - centerDistance);
  const angles = points.map((point, index) => angleCos(points[(index + 3) % 4], point, points[(index + 1) % 4]));
  const angleScore = Math.max(0, 1 - angles.reduce((sum, value) => sum + value, 0) / angles.length / 0.42);
  const edgeTouches = points.filter(point => point.x < width * 0.012 || point.x > width * 0.988 || point.y < height * 0.012 || point.y > height * 0.988).length;
  const edgePenalty = edgeTouches >= 2 ? 85 : edgeTouches === 1 ? 12 : 0;
  return { score: areaRatio * 55 + ratioScore * 32 + centerScore * 16 + angleScore * 22 - edgePenalty };
}

function centerCardCrop(sourceCanvas, scale, verticalBias = 0) {
  const cardRatio = CARD_WIDTH / CARD_HEIGHT;
  let height = sourceCanvas.height * scale;
  let width = height * cardRatio;
  if (width > sourceCanvas.width * 0.98) {
    width = sourceCanvas.width * 0.98;
    height = width / cardRatio;
  }
  const x = (sourceCanvas.width - width) / 2;
  const centeredY = (sourceCanvas.height - height) / 2;
  const y = Math.max(0, Math.min(sourceCanvas.height - height, centeredY + sourceCanvas.height * verticalBias));
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceCanvas, x, y, width, height, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  return canvas;
}

function rotateCanvas(source, degrees) {
  if ((degrees % 360 + 360) % 360 === 0) return source;
  const canvas = createCanvas(source.width, source.height);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

function drawImageToLimitedCanvas(image, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = createCanvas(Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function drawImageToCardCanvas(image) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
  canvas.getContext("2d").drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
  return canvas;
}

function copyCanvas(source, destination) {
  destination.width = source.width;
  destination.height = source.height;
  const ctx = destination.getContext("2d");
  ctx.clearRect(0, 0, destination.width, destination.height);
  ctx.drawImage(source, 0, 0);
}

function deduplicateCanvasShapes(canvases) {
  const seen = new Set();
  return canvases.filter(canvas => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sample = ctx.getImageData(Math.floor(canvas.width * 0.45), Math.floor(canvas.height * 0.45), 8, 8).data;
    const key = Array.from(sample.filter((_, index) => index % 4 !== 3)).map(value => Math.round(value / 24)).join("");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bild konnte nicht geladen werden."));
    };
    image.src = url;
  });
}

function loadExternalImage(src, timeoutMs) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Bild-Timeout"));
    }, timeoutMs);
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(new Error("Externes Bild konnte nicht geladen werden."));
    };
    image.src = src;
  });
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function orderQuadPoints(points) {
  const sortedBySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const topLeft = sortedBySum[0];
  const bottomRight = sortedBySum[3];
  const remaining = points.filter(point => point !== topLeft && point !== bottomRight);
  const topRight = remaining[0].x - remaining[0].y > remaining[1].x - remaining[1].y ? remaining[0] : remaining[1];
  const bottomLeft = topRight === remaining[0] ? remaining[1] : remaining[0];
  return [topLeft, topRight, bottomRight, bottomLeft];
}

function cardSetId(card) {
  const localId = String(card.localId || "");
  const suffix = `-${localId}`;
  return String(card.id || "").endsWith(suffix) ? String(card.id).slice(0, -suffix.length) : String(card.id || "").split("-")[0];
}

function setCodeMatchesCard(code, card) {
  const normalizedCode = normalizeSetCode(code);
  if (!normalizedCode) return false;
  const ids = [card._setId, card.set?.id, deriveSearchSetCode(card)].map(normalizeSetCode).filter(Boolean);
  return ids.some(value => value === normalizedCode || value.endsWith(normalizedCode) || normalizedCode.endsWith(value));
}

function deriveSearchSetCode(card) {
  const id = String(card.set?.id || card._setId || "").toUpperCase();
  if (/^[A-Z]{2,6}$/.test(id)) return id;
  if (/^[A-Z]{2,5}P$/.test(id)) return id;
  return "";
}

function parseManualIdentifier(value) {
  const text = String(value || "").trim().toUpperCase();
  const full = text.match(/(?:\b([A-Z0-9]{2,6})\s+)?([A-Z]*\d{1,3})\s*\/\s*(\d{2,3})/);
  if (full) return { setCode: normalizeSetCode(full[1]), number: normalizeCollectorNumber(full[2]), denominator: Number(full[3]) };
  return { setCode: "", number: normalizeCollectorNumber(text), denominator: null };
}

function formatIdentifierForInput(identifier) {
  if (!identifier?.number) return "";
  const main = identifier.denominator ? `${identifier.number}/${identifier.denominator}` : identifier.number;
  return identifier.setCode ? `${identifier.setCode} ${main}` : main;
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
  const cleaned = String(value || "").toUpperCase().replace(/O/g, "0").replace(/\s+/g, "").replace(/[^A-Z0-9]/g, "");
  const match = cleaned.match(/([A-Z]*)(\d{1,4})$/);
  if (!match) return "";
  let digits = match[2];
  // OCR verdoppelt bei sehr kleinen Ziffern gelegentlich eine führende Null:
  // „0030“ wird zu „030“, echte dreistellige Nummern bleiben unverändert.
  while (digits.length > 3 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length > 3) return "";
  return `${match[1]}${digits}`;
}

function normalizeSetCode(value) {
  const cleaned = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned || /^(DE|EN|FR|IT|ES|PT)$/.test(cleaned)) return "";
  return cleaned;
}

function numberVariants(number) {
  const normalized = normalizeCollectorNumber(number);
  const match = normalized.match(/^([A-Z]*)(\d{1,3})$/);
  if (!match) return [];
  const [, prefix, digits] = match;
  const variants = new Set([normalized, `${prefix}${Number(digits)}`]);
  if (!prefix) {
    variants.add(digits.padStart(2, "0"));
    variants.add(digits.padStart(3, "0"));
  }
  return [...variants].filter(Boolean);
}

function nameSearchVariants(name, mechanics = []) {
  const clean = String(name || "").trim();
  if (clean.length < 3) return [];
  const variants = new Set([clean]);
  const base = stripCardMechanics(clean);
  if (base.length >= 3) variants.add(base);

  const words = clean.split(/[\s-]+/).filter(Boolean);
  const longestWord = [...words]
    .filter(word => !/^(mega|ex|gx|vmax|vstar|v)$/i.test(word))
    .sort((a, b) => b.length - a.length)[0];
  if (longestWord?.length >= 4) variants.add(longestWord);
  if (clean.length >= 7) variants.add(clean.slice(0, -1));

  // Bei kleinen weißen Schriften entstehen häufig ein zusätzliches Zeichen am
  // Anfang oder ein einzelner Buchstabenfehler. Kurze Wortfragmente sorgen
  // dafür, dass die Datenbank trotzdem passende Namensfamilien liefert; die
  // endgültige Sortierung übernimmt anschließend der Bildvergleich.
  const compactLetters = clean.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
  if (compactLetters.length >= 8) {
    variants.add(compactLetters.slice(-5));
    variants.add(compactLetters.slice(-6));
    variants.add(compactLetters.slice(0, 6));
  }
  if (/^[A-Za-z][A-ZÄÖÜ]/.test(clean) && clean.length >= 6) variants.add(clean.slice(1));

  if (base && mechanics.includes("mega")) {
    variants.add(`Mega-${base} ex`);
    variants.add(`Mega ${base} ex`);
    variants.add(`${base} ex`);
  } else if (base && mechanics.includes("ex")) {
    variants.add(`${base} ex`);
  }

  return [...variants].filter(value => value.length >= 3).slice(0, 8);
}

function stripCardMechanics(value) {
  return String(value || "")
    .replace(/[€£]/g, "e")
    .replace(/mega[\s-]*/gi, "")
    .replace(/(?:pok[eé]mon[-\s]*)?(?:ex|gx|vmax|vstar|v-union|break)/gi, "")
    .replace(/tag[-\s]*team/gi, "")
    .replace(/(?:radiant|strahlend(?:es|er|e)?|shining|gl[aä]nzend(?:es|er|e)?)/gi, "")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .trim();
}

function mechanicsFromCardName(value) {
  const text = String(value || "").replace(/[€£]/g, "e").toLowerCase();
  const result = [];
  const add = mechanic => { if (!result.includes(mechanic)) result.push(mechanic); };
  if (/mega|^m\s+[a-z]/i.test(text)) add("mega");
  if (/ex/i.test(text)) add("ex");
  if (/gx/i.test(text)) add("gx");
  if (/vmax/i.test(text)) add("vmax");
  if (/vstar|v-star/i.test(text)) add("vstar");
  if (/v-union/i.test(text)) add("v-union");
  if (/tag[-\s]*team/i.test(text)) add("tag-team");
  if (/break/i.test(text)) add("break");
  if (/radiant|strahlend/i.test(text)) add("radiant");
  if (/shining|gl[aä]nzend/i.test(text)) add("shining");
  return result;
}

function setCodeVariants(value) {
  const clean = normalizeSetCode(value);
  if (!clean) return [];
  const variants = new Set([clean]);
  // I, L und 1 sind in der winzigen Setzeile kaum unterscheidbar.
  if (/[I1]/.test(clean)) variants.add(clean.replace(/[I1]/g, "L"));
  if (/L/.test(clean)) {
    variants.add(clean.replace(/L/g, "I"));
    variants.add(clean.replace(/L/g, "1"));
  }
  return [...variants];
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
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
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

function normalizeVector(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length);
  const deviation = Math.sqrt(variance) || 1;
  return values.map(value => (value - mean) / deviation);
}

function vectorCorrelation(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aa += a[index] ** 2;
    bb += b[index] ** 2;
  }
  if (!aa || !bb) return 0;
  return clamp01((dot / Math.sqrt(aa * bb) + 1) / 2);
}

function cosineSimilarity(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aa += a[index] ** 2;
    bb += b[index] ** 2;
  }
  return aa && bb ? clamp01(dot / Math.sqrt(aa * bb)) : 0;
}

function otsuThreshold(values) {
  const histogram = new Uint32Array(256);
  for (const value of values) histogram[Math.max(0, Math.min(255, Math.round(value)))] += 1;
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

function cleanOcrLine(line) {
  return String(line || "").replace(/[|©®™]/g, " ").replace(/[“”„]/g, '"').replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
}

function angleCos(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const denominator = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
  return denominator ? Math.abs((ab.x * cb.x + ab.y * cb.y) / denominator) : 1;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function promiseWithTimeout(promise, milliseconds) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Zeitüberschreitung")), milliseconds))
  ]);
}

function unique(values) {
  return [...new Set(values)];
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function formatEuro(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
