"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const menuButton = $("#openSystemMenuButton");
  const menuSheet = $("#systemMenuSheet");
  const menuBackdrop = $("#systemMenuBackdrop");
  const closeButton = $("#closeSystemMenuButton");
  const focusLed = $("#scannerFocusLed");
  const focusText = $("#scannerFocusText");
  const cameraStatus = $("#cameraStatus");
  const scannerModal = $("#scannerModal");
  let returnFocus = null;

  function openSystemMenu() {
    if (!menuSheet || menuSheet.classList.contains("open")) return;
    returnFocus = document.activeElement;
    menuSheet.classList.remove("hidden");
    menuBackdrop?.classList.remove("hidden");
    requestAnimationFrame(() => {
      menuSheet.classList.add("open");
      menuBackdrop?.classList.add("open");
    });
    menuSheet.setAttribute("aria-hidden", "false");
    menuBackdrop?.setAttribute("aria-hidden", "false");
    menuButton?.setAttribute("aria-expanded", "true");
    document.body.classList.add("system-menu-open");
    setTimeout(() => menuSheet.querySelector("button")?.focus({ preventScroll: true }), 120);
  }

  function closeSystemMenu({ restoreFocus = true } = {}) {
    if (!menuSheet?.classList.contains("open")) return;
    menuSheet.classList.remove("open");
    menuBackdrop?.classList.remove("open");
    menuSheet.setAttribute("aria-hidden", "true");
    menuBackdrop?.setAttribute("aria-hidden", "true");
    menuButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("system-menu-open");
    setTimeout(() => {
      if (!menuSheet.classList.contains("open")) {
        menuSheet.classList.add("hidden");
        menuBackdrop?.classList.add("hidden");
      }
    }, 290);
    if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  }

  function updateDock(view = "dashboard") {
    const start = $("#showDashboardView");
    const scan = $("#showScannerView");
    const system = $("#openSystemMenuButton");
    start?.classList.toggle("active", view === "dashboard");
    scan?.classList.toggle("active", view === "scanner");
    system?.classList.toggle("active", !["dashboard", "scanner"].includes(view));
    document.body.dataset.carddexView = view;
  }

  function setFocusState(state, label) {
    if (!focusLed || !focusText) return;
    focusLed.classList.remove("state-off", "state-green", "state-red", "state-amber", "pulse");
    focusLed.classList.add(`state-${state}`);
    if (state === "amber") focusLed.classList.add("pulse");
    focusText.textContent = label;
  }

  function syncCameraStatus() {
    const text = String(cameraStatus?.textContent || "").toLowerCase();
    if (scannerModal?.classList.contains("hidden")) {
      setFocusState("off", "SCANNER AUS");
    } else if (/nicht möglich|fehlgeschlagen|konnte nicht|fehler/.test(text)) {
      setFocusState("red", "KAMERA FEHLER");
    } else if (/gestartet|vorbereitet|gewechselt|wird/.test(text)) {
      setFocusState("amber", "KAMERA STARTET");
    } else {
      setFocusState("green", "SCAN BEREIT");
    }
  }

  function showScannerInfo() {
    const toast = $("#collectionToast");
    if (!toast) return;
    toast.textContent = "Karte vollständig zeigen, Kamera parallel halten und direkte Lichtreflexe vermeiden.";
    toast.classList.add("show");
    clearTimeout(showScannerInfo.timeout);
    showScannerInfo.timeout = setTimeout(() => toast.classList.remove("show"), 2800);
  }

  menuButton?.addEventListener("click", openSystemMenu);
  closeButton?.addEventListener("click", () => closeSystemMenu());
  menuBackdrop?.addEventListener("click", () => closeSystemMenu());

  menuSheet?.querySelectorAll("#showCollectionView, #showSetsView, #showInsightsView, #showHistoryView").forEach(button => {
    button.addEventListener("click", () => closeSystemMenu({ restoreFocus: false }));
  });

  $("#systemOpenWishlistButton")?.addEventListener("click", async () => {
    closeSystemMenu({ restoreFocus: false });
    await window.CardDexCollections?.openWishlist?.();
  });

  $("#openSettingsButton")?.addEventListener("click", () => closeSystemMenu({ restoreFocus: false }));
  $(".evolution-info-button")?.addEventListener("click", showScannerInfo);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menuSheet?.classList.contains("open")) {
      event.preventDefault();
      closeSystemMenu();
    }
  });

  window.CardDexCore?.on?.("view-changed", event => {
    updateDock(event?.detail?.view || event?.view || window.CardDexLibrary?.getActiveView?.() || "dashboard");
    closeSystemMenu({ restoreFocus: false });
  });

  if (cameraStatus) new MutationObserver(syncCameraStatus).observe(cameraStatus, { childList: true, characterData: true, subtree: true });
  if (scannerModal) new MutationObserver(syncCameraStatus).observe(scannerModal, { attributes: true, attributeFilter: ["class"] });
  syncCameraStatus();
  updateDock("dashboard");
})();
