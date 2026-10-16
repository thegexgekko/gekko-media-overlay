const MODULE_ID = "gekko-media-overlay";
const SOCKET_NAME = `module.${MODULE_ID}`;
const SETTING_OVERLAYS = "overlays";
const RUNTIME_LAYER_ID = "gekko-media-overlay-layer";
const PLAYER_POS_PREFIX = `${MODULE_ID}:player-position`;
const PLAYER_SIZE_PREFIX = `${MODULE_ID}:player-size`;
const CUSTOM_FRAME_ROOT = "gekko-media-overlay/frames";

const VIDEO_EXTENSIONS = new Set(["webm", "mp4", "m4v", "ogv", "ogg", "mov"]);
const PLACEMENT_MODES = new Set(["fixed", "gm", "player"]);
const CONTENT_TYPES = new Set(["media", "text", "html"]);
const BUILTIN_FRAME_IDS = new Set(["none", "simple", "metal", "holo", "terminal", "fantasy"]);

const DEFAULT_OVERLAY = Object.freeze({
  id: "",
  name: "Nouvelle fenêtre",
  contentType: "media",
  media: "",
  textContent: "",
  htmlContent: "",
  textAlign: "left",
  textFontSize: 18,
  textColor: "#ffffff",
  width: 60,
  widthUnit: "vw",
  height: 0,
  heightUnit: "auto",
  position: "center",
  placementMode: "fixed",
  floatX: 50,
  floatY: 50,
  floatWidth: 60,
  floatHeight: 35,
  preserveRatio: true,
  darkBackdrop: false,
  contentOpacity: 100,
  backgroundOpacity: 92,
  frameStyle: "none",
  customFrame: null,
  allowPlayerClose: false,
  autoplay: true,
  loop: false,
  muted: true,
  controls: true,
  targetMode: "allPlayers",
  recipients: [],
  includeGM: false,
  active: false,
  activeRecipients: []
});

let managerInstance = null;
let customFramesCache = new Map();

function clone(value) {
  return foundry.utils.deepClone(value);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getStoredOverlays() {
  const value = game.settings.get(MODULE_ID, SETTING_OVERLAYS);
  return value && typeof value === "object" ? clone(value) : {};
}

async function setStoredOverlays(overlays) {
  return game.settings.set(MODULE_ID, SETTING_OVERLAYS, clone(overlays));
}

function anchorPosition(position = "center") {
  const map = {
    "top-left": [15, 15],
    top: [50, 15],
    "top-right": [85, 15],
    left: [15, 50],
    center: [50, 50],
    right: [85, 50],
    "bottom-left": [15, 85],
    bottom: [50, 85],
    "bottom-right": [85, 85]
  };
  return map[position] ?? map.center;
}

function normalizeOverlay(data = {}) {
  const overlay = { ...clone(DEFAULT_OVERLAY), ...clone(data) };
  overlay.recipients = Array.isArray(overlay.recipients) ? overlay.recipients : [];
  overlay.activeRecipients = Array.isArray(overlay.activeRecipients) ? overlay.activeRecipients : [];
  overlay.contentType = CONTENT_TYPES.has(overlay.contentType) ? overlay.contentType : "media";
  overlay.width = safeNumber(overlay.width, DEFAULT_OVERLAY.width);
  overlay.height = safeNumber(overlay.height, DEFAULT_OVERLAY.height);
  overlay.placementMode = PLACEMENT_MODES.has(overlay.placementMode) ? overlay.placementMode : "fixed";
  overlay.floatX = clamp(safeNumber(overlay.floatX, 50), 0, 100);
  overlay.floatY = clamp(safeNumber(overlay.floatY, 50), 0, 100);
  overlay.floatWidth = clamp(safeNumber(overlay.floatWidth, overlay.widthUnit === "vw" ? overlay.width : 60), 8, 96);
  overlay.floatHeight = clamp(safeNumber(overlay.floatHeight, 35), 8, 92);
  overlay.contentOpacity = clamp(safeNumber(overlay.contentOpacity, 100), 10, 100);
  overlay.backgroundOpacity = clamp(safeNumber(overlay.backgroundOpacity, 92), 0, 100);
  overlay.textFontSize = clamp(safeNumber(overlay.textFontSize, 18), 8, 96);
  overlay.textAlign = ["left", "center", "right", "justify"].includes(overlay.textAlign) ? overlay.textAlign : "left";
  overlay.textColor = typeof overlay.textColor === "string" && overlay.textColor ? overlay.textColor : "#ffffff";
  overlay.frameStyle = typeof overlay.frameStyle === "string" && overlay.frameStyle ? overlay.frameStyle : "none";
  overlay.customFrame = overlay.customFrame && typeof overlay.customFrame === "object" ? clone(overlay.customFrame) : null;
  overlay.allowPlayerClose = Boolean(overlay.allowPlayerClose);
  overlay.preserveRatio = overlay.contentType === "media" ? true : Boolean(overlay.preserveRatio);
  return overlay;
}

function createOverlayData() {
  const overlay = normalizeOverlay(DEFAULT_OVERLAY);
  overlay.id = foundry.utils.randomID();
  return overlay;
}

function getRuntimeLayer() {
  let layer = document.getElementById(RUNTIME_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = RUNTIME_LAYER_ID;
    layer.setAttribute("aria-live", "polite");
    document.body.appendChild(layer);
  }
  return layer;
}

function runtimeId(overlayId) {
  return `gmo-runtime-${overlayId}`;
}

function removeRuntimeOverlay(overlayId) {
  document.getElementById(runtimeId(overlayId))?.remove();
}

function removeAllRuntimeOverlays({ includePreview = false } = {}) {
  const layer = document.getElementById(RUNTIME_LAYER_ID);
  if (!layer) return;
  for (const child of [...layer.children]) {
    if (!includePreview && child.dataset.preview === "true") continue;
    child.remove();
  }
}

function cssDimension(value, unit, axis = "width") {
  if (unit === "auto") return "auto";
  const n = Math.max(1, Number(value) || 1);
  if (unit === "px") return `${n}px`;
  if (unit === "vw") return `${Math.min(n, 100)}vw`;
  if (unit === "vh") return `${Math.min(n, 100)}vh`;
  return axis === "width" ? "60vw" : "auto";
}

function positionClass(position) {
  const allowed = new Set([
    "top-left", "top", "top-right",
    "left", "center", "right",
    "bottom-left", "bottom", "bottom-right"
  ]);
  return allowed.has(position) ? position : "center";
}

function detectMediaType(path) {
  const clean = String(path ?? "").split(/[?#]/)[0];
  const ext = clean.includes(".") ? clean.split(".").pop().toLowerCase() : "";
  return VIDEO_EXTENSIONS.has(ext) ? "video" : "image";
}

function sanitizeUrl(value, { image = false } = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^(javascript|vbscript):/i.test(raw)) return "";
  if (/^data:/i.test(raw)) return image && /^data:image\/(png|jpeg|jpg|gif|webp);/i.test(raw) ? raw : "";
  return raw;
}

function sanitizeSimpleHTML(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html ?? "");
  const allowedTags = new Set([
    "P", "DIV", "SPAN", "H1", "H2", "H3", "H4", "STRONG", "B", "EM", "I", "U", "S",
    "UL", "OL", "LI", "BR", "HR", "BLOCKQUOTE", "CODE", "PRE", "A", "IMG",
    "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"
  ]);
  const globalAttrs = new Set(["title"]);
  const tagAttrs = {
    A: new Set(["href", "target", "rel"]),
    IMG: new Set(["src", "alt", "width", "height"]),
    TH: new Set(["colspan", "rowspan"]),
    TD: new Set(["colspan", "rowspan"])
  };

  const walk = node => {
    for (const child of [...node.children]) {
      if (!allowedTags.has(child.tagName)) {
        child.replaceWith(...child.childNodes);
        continue;
      }

      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const allowed = globalAttrs.has(name) || tagAttrs[child.tagName]?.has(name);
        if (!allowed || name.startsWith("on") || name === "style" || name === "class" || name === "id") {
          child.removeAttribute(attr.name);
          continue;
        }
        if (child.tagName === "A" && name === "href") {
          const safe = sanitizeUrl(attr.value);
          if (safe) child.setAttribute("href", safe);
          else child.removeAttribute("href");
        }
        if (child.tagName === "IMG" && name === "src") {
          const safe = sanitizeUrl(attr.value, { image: true });
          if (safe) child.setAttribute("src", safe);
          else child.removeAttribute("src");
        }
      }

      if (child.tagName === "A") {
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      walk(child);
    }
  };

  walk(template.content);
  return template.innerHTML;
}

function buildContentElement(overlay, { controllerOnly = false } = {}) {
  let element;

  if (overlay.contentType === "text") {
    element = document.createElement("div");
    element.className = "gmo-rich-content gmo-text-content";
    element.textContent = overlay.textContent || "";
  } else if (overlay.contentType === "html") {
    element = document.createElement("div");
    element.className = "gmo-rich-content gmo-html-content";
    element.innerHTML = sanitizeSimpleHTML(overlay.htmlContent || "");
  } else {
    const type = detectMediaType(overlay.media);
    if (type === "video") {
      element = document.createElement("video");
      element.src = overlay.media;
      element.autoplay = Boolean(overlay.autoplay);
      element.loop = Boolean(overlay.loop);
      element.muted = controllerOnly ? true : Boolean(overlay.muted);
      element.controls = Boolean(overlay.controls);
      element.playsInline = true;
      element.preload = "auto";

      if (overlay.autoplay) {
        element.addEventListener("canplay", () => {
          element.play().catch(() => {
            element.controls = true;
            element.classList.add("gmo-autoplay-blocked");
          });
        }, { once: true });
      }
    } else {
      element = document.createElement("img");
      element.src = overlay.media;
      element.alt = overlay.name || "Média";
      element.draggable = false;
    }
    element.classList.add("gmo-media");
  }

  element.style.opacity = String(overlay.contentOpacity / 100);
  element.style.textAlign = overlay.textAlign;
  element.style.fontSize = `${overlay.textFontSize}px`;
  element.style.color = overlay.textColor;
  return element;
}

function playerPositionKey(overlayId) {
  const worldId = game.world?.id ?? "world";
  const userId = game.user?.id ?? "user";
  return `${PLAYER_POS_PREFIX}:${worldId}:${userId}:${overlayId}`;
}

function playerSizeKey(overlayId) {
  const worldId = game.world?.id ?? "world";
  const userId = game.user?.id ?? "user";
  return `${PLAYER_SIZE_PREFIX}:${worldId}:${userId}:${overlayId}`;
}

function getPlayerPosition(overlayId) {
  try {
    const raw = localStorage.getItem(playerPositionKey(overlayId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.x)) || !Number.isFinite(Number(parsed?.y))) return null;
    return { x: clamp(Number(parsed.x), 0, 100), y: clamp(Number(parsed.y), 0, 100) };
  } catch (_error) {
    return null;
  }
}

function setPlayerPosition(overlayId, x, y) {
  try {
    localStorage.setItem(playerPositionKey(overlayId), JSON.stringify({ x, y }));
  } catch (_error) {}
}

function clearPlayerPosition(overlayId) {
  try {
    localStorage.removeItem(playerPositionKey(overlayId));
  } catch (_error) {}
}

function getPlayerSize(overlayId) {
  try {
    const raw = localStorage.getItem(playerSizeKey(overlayId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Number.isFinite(Number(parsed?.w))) return null;
    return {
      w: clamp(Number(parsed.w), 8, 96),
      h: Number.isFinite(Number(parsed?.h)) ? clamp(Number(parsed.h), 8, 92) : null
    };
  } catch (_error) {
    return null;
  }
}

function setPlayerSize(overlayId, w, h = null) {
  try {
    localStorage.setItem(playerSizeKey(overlayId), JSON.stringify({ w, h }));
  } catch (_error) {}
}

function clearPlayerSize(overlayId) {
  try {
    localStorage.removeItem(playerSizeKey(overlayId));
  } catch (_error) {}
}

function floatingPositionFor(overlay) {
  if (overlay.placementMode === "player") {
    return getPlayerPosition(overlay.id) ?? { x: overlay.floatX, y: overlay.floatY };
  }
  return { x: overlay.floatX, y: overlay.floatY };
}

function floatingSizeFor(overlay) {
  if (overlay.placementMode === "player") {
    const local = getPlayerSize(overlay.id);
    if (local) return local;
  }
  return { w: overlay.floatWidth, h: overlay.floatHeight };
}

function setFloatingFramePosition(frame, x, y, { clampToViewport = true } = {}) {
  let nextX = clamp(Number(x) || 50, 0, 100);
  let nextY = clamp(Number(y) || 50, 0, 100);

  if (clampToViewport && frame.isConnected) {
    const rect = frame.getBoundingClientRect();
    const halfW = Math.min(rect.width / 2, window.innerWidth / 2);
    const halfH = Math.min(rect.height / 2, window.innerHeight / 2);
    const minX = window.innerWidth ? (halfW / window.innerWidth) * 100 : 0;
    const maxX = window.innerWidth ? 100 - minX : 100;
    const minY = window.innerHeight ? (halfH / window.innerHeight) * 100 : 0;
    const maxY = window.innerHeight ? 100 - minY : 100;
    nextX = clamp(nextX, minX, maxX);
    nextY = clamp(nextY, minY, maxY);
  }

  frame.style.left = `${nextX}%`;
  frame.style.top = `${nextY}%`;
  frame.style.right = "auto";
  frame.style.bottom = "auto";
  frame.style.transform = "translate(-50%, -50%)";
  frame.dataset.floatX = String(nextX);
  frame.dataset.floatY = String(nextY);
  return { x: nextX, y: nextY };
}

function setFloatingFrameSize(frame, overlay, w, h = null) {
  const nextW = clamp(Number(w) || overlay.floatWidth || 60, 8, 96);
  const mediaRatio = overlay.contentType === "media";
  frame.style.width = `${nextW}vw`;

  if (mediaRatio) {
    frame.style.height = "auto";
    frame.dataset.floatHeight = "";
  } else {
    const nextH = clamp(Number(h) || overlay.floatHeight || 35, 8, 92);
    frame.style.height = `${nextH}vh`;
    frame.dataset.floatHeight = String(nextH);
  }

  frame.dataset.floatWidth = String(nextW);
  return {
    w: nextW,
    h: mediaRatio ? null : Number(frame.dataset.floatHeight)
  };
}

function updateRuntimePosition(overlayId, x, y) {
  const root = document.getElementById(runtimeId(overlayId));
  const frame = root?.querySelector(".gmo-runtime-frame");
  if (!frame) return null;
  return setFloatingFramePosition(frame, x, y);
}

function updateRuntimeSize(overlayId, w, h = null) {
  const root = document.getElementById(runtimeId(overlayId));
  const frame = root?.querySelector(".gmo-runtime-frame");
  const overlay = root?._gmoOverlay;
  if (!frame || !overlay) return null;
  const result = setFloatingFrameSize(frame, overlay, w, h);
  requestAnimationFrame(() => setFloatingFramePosition(frame, Number(frame.dataset.floatX) || 50, Number(frame.dataset.floatY) || 50));
  return result;
}

async function persistGMGeometry(overlayId, { x = null, y = null, w = null, h = null } = {}) {
  if (!game.user?.isGM) return;
  const overlays = getStoredOverlays();
  if (!overlays[overlayId]) return;
  const overlay = normalizeOverlay(overlays[overlayId]);
  if (x !== null) overlay.floatX = x;
  if (y !== null) overlay.floatY = y;
  if (w !== null) overlay.floatWidth = w;
  if (h !== null) overlay.floatHeight = h;
  overlays[overlayId] = overlay;
  await setStoredOverlays(overlays);
  if (managerInstance?.rendered) await managerInstance.render({ force: true });
}

function canDragOverlay(overlay, { preview = false } = {}) {
  if (preview) return false;
  if (overlay.placementMode === "gm") return Boolean(game.user?.isGM);
  if (overlay.placementMode === "player") return true;
  return false;
}

function canResizeOverlay(overlay, { preview = false } = {}) {
  return canDragOverlay(overlay, { preview });
}

function canPlayerClose(overlay, { preview = false, controllerOnly = false } = {}) {
  return !preview && !controllerOnly && !game.user?.isGM && overlay.allowPlayerClose;
}

function safeFrameValue(value, fallback, min, max) {
  return clamp(safeNumber(value, fallback), min, max);
}

function applyFrameStyle(frame, overlay) {
  for (const id of BUILTIN_FRAME_IDS) frame.classList.remove(`gmo-frame-${id}`);
  frame.classList.add(`gmo-frame-${BUILTIN_FRAME_IDS.has(overlay.frameStyle) ? overlay.frameStyle : "none"}`);

  if (!overlay.frameStyle.startsWith("custom:")) return;
  const def = overlay.customFrame;
  if (!def || typeof def !== "object") return;

  const image = sanitizeUrl(def.image, { image: true });
  if (!image) return;

  frame.classList.add("gmo-frame-custom");

  // Mode simple (image déposée directement dans frames/) : on conserve le dessin
  // complet et on le superpose à la fenêtre, sans découpage 9-slice arbitraire.
  if (def.mode === "overlay") {
    frame.classList.add("gmo-frame-custom-overlay");
    frame.style.setProperty("--gmo-custom-frame-image", `url("${image.replaceAll('"', '%22')}")`);
    frame.style.border = "0";
    frame.style.padding = "0";
    frame.style.borderRadius = "0";
    return;
  }

  // Mode avancé (frame.json) : garde le système 9-slice configurable.
  const slice = safeFrameValue(def.slice, 32, 1, 256);
  const width = safeFrameValue(def.width, 14, 1, 96);
  const padding = safeFrameValue(def.padding, 10, 0, 96);
  const radius = safeFrameValue(def.radius, 0, 0, 64);

  frame.classList.add("gmo-frame-custom-border");
  frame.style.borderStyle = "solid";
  frame.style.borderWidth = `${width}px`;
  frame.style.borderImageSource = `url("${image.replaceAll('"', '%22')}")`;
  frame.style.borderImageSlice = String(slice);
  frame.style.borderImageWidth = String(width);
  frame.style.borderImageRepeat = ["stretch", "repeat", "round", "space"].includes(def.repeat) ? def.repeat : "stretch";
  frame.style.padding = `${padding}px`;
  frame.style.borderRadius = `${radius}px`;
}

function addRuntimeChrome(frame, overlay, { preview = false, controllerOnly = false } = {}) {
  const canDrag = canDragOverlay(overlay, { preview });
  const canResize = canResizeOverlay(overlay, { preview });
  const canClose = canPlayerClose(overlay, { preview, controllerOnly });
  if (!canDrag && !canResize && !canClose && !controllerOnly) return;

  const chrome = document.createElement("div");
  chrome.className = "gmo-floating-chrome";

  if (canDrag) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "gmo-drag-handle";
    handle.title = overlay.placementMode === "gm"
      ? "Déplacer cette fenêtre chez les joueurs"
      : "Déplacer cette fenêtre";
    handle.innerHTML = '<i class="fa-solid fa-up-down-left-right"></i><span>Déplacer</span>';
    chrome.appendChild(handle);
    setupDragging(handle, frame, overlay);
  }

  if (canResize) {
    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "gmo-resize-handle";
    resize.title = overlay.contentType === "media"
      ? "Redimensionner (ratio de l’image/vidéo conservé)"
      : "Redimensionner";
    resize.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i><span>Taille</span>';
    chrome.appendChild(resize);
    setupResizing(resize, frame, overlay);
  }

  if (canDrag) {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "gmo-runtime-reset";
    reset.title = "Recentrer et réinitialiser la taille";
    reset.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
    reset.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      const [x, y] = anchorPosition(overlay.position);
      const actualPos = setFloatingFramePosition(frame, x, y);
      const actualSize = setFloatingFrameSize(frame, overlay, overlay.floatWidth, overlay.floatHeight);
      if (overlay.placementMode === "gm" && game.user.isGM) {
        broadcastPacket({ action: "geometry", overlayId: overlay.id, ...actualPos, ...actualSize });
        await persistGMGeometry(overlay.id, { ...actualPos, ...actualSize });
      } else if (overlay.placementMode === "player") {
        setPlayerPosition(overlay.id, actualPos.x, actualPos.y);
        setPlayerSize(overlay.id, actualSize.w, actualSize.h);
      }
    });
    chrome.appendChild(reset);
  }

  if (canClose) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "gmo-player-close";
    close.title = "Fermer cette fenêtre sur mon écran";
    close.innerHTML = '<i class="fa-solid fa-xmark"></i><span>Fermer</span>';
    close.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      frame.closest(".gmo-runtime")?.remove();
    });
    chrome.appendChild(close);
  }

  if (controllerOnly) {
    const badge = document.createElement("span");
    badge.className = "gmo-controller-badge";
    badge.textContent = "PLACEMENT MJ";
    chrome.appendChild(badge);
  }

  frame.appendChild(chrome);
}

function setupDragging(handle, frame, overlay) {
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = frame.getBoundingClientRect();
    const offsetX = event.clientX - (rect.left + rect.width / 2);
    const offsetY = event.clientY - (rect.top + rect.height / 2);
    frame.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);

    let latest = {
      x: Number(frame.dataset.floatX) || 50,
      y: Number(frame.dataset.floatY) || 50
    };
    let rafPending = false;

    const onMove = moveEvent => {
      const centerX = moveEvent.clientX - offsetX;
      const centerY = moveEvent.clientY - offsetY;
      const x = window.innerWidth ? (centerX / window.innerWidth) * 100 : 50;
      const y = window.innerHeight ? (centerY / window.innerHeight) * 100 : 50;
      latest = setFloatingFramePosition(frame, x, y);

      if (overlay.placementMode === "gm" && game.user.isGM && !rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          broadcastPacket({ action: "geometry", overlayId: overlay.id, x: latest.x, y: latest.y });
        });
      }
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      frame.classList.remove("is-dragging");

      if (overlay.placementMode === "gm" && game.user.isGM) {
        broadcastPacket({ action: "geometry", overlayId: overlay.id, x: latest.x, y: latest.y });
        await persistGMGeometry(overlay.id, { x: latest.x, y: latest.y });
      } else if (overlay.placementMode === "player") {
        setPlayerPosition(overlay.id, latest.x, latest.y);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  });
}

function setupResizing(handle, frame, overlay) {
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const rect = frame.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const ratio = startH > 0 ? startW / startH : 16 / 9;
    frame.classList.add("is-resizing");
    handle.setPointerCapture?.(event.pointerId);

    let latest = {
      w: Number(frame.dataset.floatWidth) || overlay.floatWidth,
      h: frame.dataset.floatHeight ? Number(frame.dataset.floatHeight) : null
    };
    let rafPending = false;

    const onMove = moveEvent => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      let pxW = Math.max(120, startW + deltaX);
      let pxH = Math.max(80, startH + deltaY);

      if (overlay.contentType === "media") {
        const dominant = Math.abs(deltaX) >= Math.abs(deltaY) ? pxW : pxH * ratio;
        pxW = Math.max(120, dominant);
        pxH = pxW / ratio;
      }

      const w = window.innerWidth ? (pxW / window.innerWidth) * 100 : overlay.floatWidth;
      const h = overlay.contentType === "media"
        ? null
        : (window.innerHeight ? (pxH / window.innerHeight) * 100 : overlay.floatHeight);
      latest = setFloatingFrameSize(frame, overlay, w, h);
      setFloatingFramePosition(frame, Number(frame.dataset.floatX) || 50, Number(frame.dataset.floatY) || 50);

      if (overlay.placementMode === "gm" && game.user.isGM && !rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          broadcastPacket({ action: "geometry", overlayId: overlay.id, w: latest.w, h: latest.h });
        });
      }
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      frame.classList.remove("is-resizing");

      if (overlay.placementMode === "gm" && game.user.isGM) {
        broadcastPacket({ action: "geometry", overlayId: overlay.id, w: latest.w, h: latest.h });
        await persistGMGeometry(overlay.id, { w: latest.w, h: latest.h });
      } else if (overlay.placementMode === "player") {
        setPlayerSize(overlay.id, latest.w, latest.h);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  });
}

function renderRuntimeOverlay(rawOverlay, { preview = false, controllerOnly = false } = {}) {
  const overlay = normalizeOverlay(rawOverlay);
  const hasContent = overlay.contentType === "media"
    ? Boolean(overlay.media)
    : overlay.contentType === "text"
      ? Boolean(overlay.textContent?.trim())
      : Boolean(overlay.htmlContent?.trim());
  if (!overlay.id || !hasContent) return;

  removeRuntimeOverlay(overlay.id);

  const layer = getRuntimeLayer();
  const root = document.createElement("div");
  root.id = runtimeId(overlay.id);
  root.className = "gmo-runtime";
  root.dataset.overlayId = overlay.id;
  root.dataset.preview = preview ? "true" : "false";
  root.dataset.placementMode = overlay.placementMode;
  root.dataset.controllerOnly = controllerOnly ? "true" : "false";
  root._gmoOverlay = overlay;

  if (overlay.darkBackdrop) {
    const backdrop = document.createElement("div");
    backdrop.className = "gmo-runtime-backdrop";
    root.appendChild(backdrop);
  }

  const frame = document.createElement("div");
  frame.className = "gmo-runtime-frame";
  frame.style.setProperty("--gmo-background-opacity", String(overlay.backgroundOpacity / 100));
  applyFrameStyle(frame, overlay);

  if (overlay.placementMode === "fixed") {
    frame.classList.add(`gmo-pos-${positionClass(overlay.position)}`);
    frame.style.width = cssDimension(overlay.width, overlay.widthUnit, "width");
    frame.style.height = cssDimension(overlay.height, overlay.heightUnit, "height");
  } else {
    frame.classList.add("gmo-floating-frame");
    const pos = floatingPositionFor(overlay);
    const size = floatingSizeFor(overlay);
    setFloatingFramePosition(frame, pos.x, pos.y, { clampToViewport: false });
    setFloatingFrameSize(frame, overlay, size.w, size.h);
    requestAnimationFrame(() => {
      if (!frame.isConnected) return;
      const actual = setFloatingFramePosition(frame, Number(frame.dataset.floatX), Number(frame.dataset.floatY));
      if (overlay.placementMode === "player" && getPlayerPosition(overlay.id)) {
        setPlayerPosition(overlay.id, actual.x, actual.y);
      }
    });
  }

  if (overlay.preserveRatio) frame.classList.add("gmo-preserve-ratio");

  const content = buildContentElement(overlay, { controllerOnly });
  frame.appendChild(content);

  if (overlay.placementMode !== "fixed" && overlay.contentType === "media") {
    const eventName = detectMediaType(overlay.media) === "video" ? "loadedmetadata" : "load";
    content.addEventListener(eventName, () => {
      if (!frame.isConnected) return;
      setFloatingFrameSize(frame, overlay, Number(frame.dataset.floatWidth) || overlay.floatWidth, null);
      setFloatingFramePosition(frame, Number(frame.dataset.floatX) || 50, Number(frame.dataset.floatY) || 50);
    }, { once: true });
  }

  addRuntimeChrome(frame, overlay, { preview, controllerOnly });

  if (preview) {
    const label = document.createElement("div");
    label.className = "gmo-preview-label";
    label.textContent = "APERÇU MJ — cliquer pour fermer";
    frame.appendChild(label);
    frame.style.pointerEvents = "auto";
    frame.addEventListener("click", event => {
      if (event.target.closest("video, button, a")) return;
      root.remove();
    });
  }

  root.appendChild(frame);
  layer.appendChild(root);
}

function resolveTargets(overlay) {
  const targets = new Set();
  if (overlay.targetMode === "allPlayers") {
    for (const user of game.users) if (!user.isGM) targets.add(user.id);
  } else {
    for (const id of overlay.recipients ?? []) {
      const user = game.users.get(id);
      if (user && !user.isGM) targets.add(id);
    }
  }
  if (overlay.includeGM && game.user?.id) targets.add(game.user.id);
  return [...targets];
}

function isTrustedSender(packet) {
  const sender = game.users.get(packet?.senderId);
  return Boolean(sender?.isGM);
}

function applySocketPacket(packet) {
  if (!packet || !isTrustedSender(packet)) return;

  switch (packet.action) {
    case "sync": {
      const targets = Array.isArray(packet.targets) ? packet.targets : [];
      const overlay = normalizeOverlay(packet.overlay);
      const isTarget = targets.includes(game.user.id);
      const isGMController = overlay.placementMode === "gm" && game.user.isGM;
      if (isTarget || isGMController) renderRuntimeOverlay(overlay, { controllerOnly: isGMController && !isTarget });
      else removeRuntimeOverlay(overlay.id);
      break;
    }
    case "geometry": {
      if (packet.x !== undefined || packet.y !== undefined) {
        const root = document.getElementById(runtimeId(packet.overlayId));
        const frame = root?.querySelector(".gmo-runtime-frame");
        if (frame) updateRuntimePosition(
          packet.overlayId,
          packet.x ?? Number(frame.dataset.floatX) ?? 50,
          packet.y ?? Number(frame.dataset.floatY) ?? 50
        );
      }
      if (packet.w !== undefined || packet.h !== undefined) {
        const root = document.getElementById(runtimeId(packet.overlayId));
        const frame = root?.querySelector(".gmo-runtime-frame");
        if (frame) updateRuntimeSize(
          packet.overlayId,
          packet.w ?? Number(frame.dataset.floatWidth) ?? 60,
          packet.h ?? (frame.dataset.floatHeight ? Number(frame.dataset.floatHeight) : null)
        );
      }
      break;
    }
    case "resetPlayerGeometry": {
      const targets = Array.isArray(packet.targets) ? packet.targets : [];
      if (!targets.includes(game.user.id)) break;
      clearPlayerPosition(packet.overlayId);
      clearPlayerSize(packet.overlayId);
      updateRuntimePosition(packet.overlayId, packet.x, packet.y);
      updateRuntimeSize(packet.overlayId, packet.w, packet.h);
      break;
    }
    case "close":
      removeRuntimeOverlay(packet.overlayId);
      break;
    case "closeAll":
      removeAllRuntimeOverlays();
      break;
  }
}

function broadcastPacket(packet) {
  const enriched = { ...packet, senderId: game.user.id };
  applySocketPacket(enriched);
  game.socket.emit(SOCKET_NAME, enriched);
}

function syncLocalFromStoredState() {
  const overlays = getStoredOverlays();
  for (const raw of Object.values(overlays)) {
    const overlay = normalizeOverlay(raw);
    if (!overlay.active) continue;
    const isTarget = overlay.activeRecipients.includes(game.user.id);
    const isGMController = overlay.placementMode === "gm" && game.user.isGM;
    if (isTarget || isGMController) renderRuntimeOverlay(overlay, { controllerOnly: isGMController && !isTarget });
  }
}

function unitOptions(current, axis) {
  const options = axis === "width"
    ? [["vw", "% écran"], ["px", "px"]]
    : [["auto", "Auto"], ["vh", "% écran"], ["px", "px"]];
  return options.map(([value, label]) => ({ value, label, selected: current === value }));
}

function positionOptions(current) {
  const options = [
    ["top-left", "Haut gauche"], ["top", "Haut"], ["top-right", "Haut droite"],
    ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"],
    ["bottom-left", "Bas gauche"], ["bottom", "Bas"], ["bottom-right", "Bas droite"]
  ];
  return options.map(([value, label]) => ({ value, label, selected: current === value }));
}

function placementModeOptions(current) {
  return [
    ["fixed", "Position fixe"],
    ["gm", "Flottante — contrôlée par le MJ"],
    ["player", "Flottante — contrôlée par le joueur"]
  ].map(([value, label]) => ({ value, label, selected: current === value }));
}

function contentTypeOptions(current) {
  return [
    ["media", "Image / Vidéo"],
    ["text", "Texte"],
    ["html", "HTML simple"]
  ].map(([value, label]) => ({ value, label, selected: current === value }));
}

function textAlignOptions(current) {
  return [
    ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"], ["justify", "Justifié"]
  ].map(([value, label]) => ({ value, label, selected: current === value }));
}

function resolveFoundryPath(path) {
  if (!path) return "";
  try {
    return foundry.utils.getRoute ? foundry.utils.getRoute(path) : path;
  } catch (_error) {
    return path;
  }
}

function frameIdFromPath(path) {
  return `custom:${String(path).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`;
}

function customFrameNameFromFile(path) {
  const rawFilename = String(path ?? "").split("/").pop() ?? "Cadre personnalisé";
  let filename = rawFilename;
  try {
    filename = decodeURIComponent(rawFilename);
  } catch (_error) {
    // Certains fournisseurs peuvent renvoyer des noms partiellement encodés.
  }

  const stem = filename.replace(/\.[^.]+$/, "");
  return stem
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\S/g, match => match.toUpperCase()) || "Cadre personnalisé";
}

function isCustomFrameImage(path) {
  const clean = String(path ?? "").split(/[?#]/)[0];
  return /\.(png|webp|svg|jpe?g|gif)$/i.test(clean);
}

async function loadCustomFrames({ force = false } = {}) {
  if (customFramesCache.size && !force) return customFramesCache;
  const next = new Map();
  const FilePickerClass = foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker;
  if (!FilePickerClass?.browse) {
    customFramesCache = next;
    return next;
  }

  try {
    const root = await FilePickerClass.browse("data", CUSTOM_FRAME_ROOT);

    // Mode simple : une image déposée directement dans frames/ devient un cadre
    // avec des réglages par défaut. Aucun frame.json n'est nécessaire.
    for (const file of root?.files ?? []) {
      if (!isCustomFrameImage(file)) continue;
      const id = frameIdFromPath(file);
      next.set(id, {
        id,
        name: customFrameNameFromFile(file),
        image: resolveFoundryPath(file),
        mode: "overlay"
      });
    }

    // Mode avancé : un sous-dossier avec frame.json permet de personnaliser
    // le 9-slice, l'épaisseur, le padding, le rayon et la répétition.
    for (const dir of root?.dirs ?? []) {
      try {
        const listing = await FilePickerClass.browse("data", dir);
        const jsonPath = (listing?.files ?? []).find(file => /\/frame\.json$/i.test(file));
        if (!jsonPath) continue;
        const response = await fetch(resolveFoundryPath(jsonPath), { cache: "no-store" });
        if (!response.ok) continue;
        const raw = await response.json();
        const id = frameIdFromPath(dir);
        const imageRaw = String(raw.image ?? "frame.png");
        const baseDir = dir.replace(/\/$/, "");
        const imagePath = /^(https?:|data:|\/)/i.test(imageRaw) ? imageRaw : `${baseDir}/${imageRaw}`;
        next.set(id, {
          id,
          name: String(raw.name ?? dir.split("/").pop() ?? "Cadre personnalisé"),
          image: resolveFoundryPath(imagePath),
          mode: "border",
          slice: safeFrameValue(raw.slice, 32, 1, 256),
          width: safeFrameValue(raw.width, 14, 1, 96),
          padding: safeFrameValue(raw.padding, 10, 0, 96),
          radius: safeFrameValue(raw.radius, 0, 0, 64),
          repeat: ["stretch", "repeat", "round", "space"].includes(raw.repeat) ? raw.repeat : "stretch"
        });
      } catch (_error) {}
    }
  } catch (_error) {
    // Le dossier personnalisé est optionnel : son absence n'est pas une erreur.
  }

  customFramesCache = next;
  return next;
}

function frameOptions(current, customFrames) {
  const builtins = [
    ["none", "Aucun"],
    ["simple", "Sobre"],
    ["metal", "Métal"],
    ["holo", "Holographique"],
    ["terminal", "Terminal"],
    ["fantasy", "Fantasy"]
  ].map(([value, label]) => ({ value, label, selected: current === value }));

  const custom = [...customFrames.values()]
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
    .map(def => ({ value: def.id, label: def.name, selected: current === def.id }));

  return { builtins, custom, hasCustom: custom.length > 0 };
}

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

class MediaOverlayManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gekko-media-overlay-manager",
    classes: ["gekko-media-overlay-manager"],
    position: { width: 820, height: 860 },
    window: { icon: "gmo-gekko-icon", title: "GEKKO — Media Overlay" }
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/manager.hbs` }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = getStoredOverlays();
    const customFrames = await loadCustomFrames();
    const users = [...game.users]
      .filter(user => !user.isGM)
      .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    const overlays = Object.values(stored).map(raw => {
      const overlay = normalizeOverlay(raw);
      const recipients = new Set(overlay.recipients);
      const activeCount = overlay.activeRecipients.length;
      return {
        ...overlay,
        isSelectedMode: overlay.targetMode === "selected",
        isAllPlayersMode: overlay.targetMode === "allPlayers",
        isFixedMode: overlay.placementMode === "fixed",
        isGMFloatingMode: overlay.placementMode === "gm",
        isPlayerFloatingMode: overlay.placementMode === "player",
        isFloatingMode: overlay.placementMode !== "fixed",
        isMediaContent: overlay.contentType === "media",
        isTextContent: overlay.contentType === "text",
        isHtmlContent: overlay.contentType === "html",
        statusLabel: overlay.active ? `Affichée (${activeCount})` : "Fermée",
        widthUnits: unitOptions(overlay.widthUnit, "width"),
        heightUnits: unitOptions(overlay.heightUnit, "height"),
        positions: positionOptions(overlay.position),
        placementModes: placementModeOptions(overlay.placementMode),
        contentTypes: contentTypeOptions(overlay.contentType),
        textAligns: textAlignOptions(overlay.textAlign),
        frameStyles: frameOptions(overlay.frameStyle, customFrames),
        users: users.map(user => ({
          id: user.id,
          name: user.name,
          active: user.active,
          selected: recipients.has(user.id)
        }))
      };
    });

    overlays.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    return { ...context, overlays, hasOverlays: overlays.length > 0, customFrameRoot: CUSTOM_FRAME_ROOT };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    managerInstance = this;
    this._boundOnClick ??= this.#onClick.bind(this);
    this._boundOnChange ??= this.#onChange.bind(this);
    this._boundOnInput ??= this.#onInput.bind(this);
    this.element.removeEventListener("click", this._boundOnClick);
    this.element.removeEventListener("change", this._boundOnChange);
    this.element.removeEventListener("input", this._boundOnInput);
    this.element.addEventListener("click", this._boundOnClick);
    this.element.addEventListener("change", this._boundOnChange);
    this.element.addEventListener("input", this._boundOnInput);
  }

  #cardFromTarget(target) {
    return target.closest("[data-overlay-id]");
  }

  #readCard(card) {
    const id = card.dataset.overlayId;
    const get = selector => card.querySelector(selector);
    const checkedRecipients = [...card.querySelectorAll('input[name="recipient"]:checked')].map(input => input.value);
    const frameStyle = get('[name="frameStyle"]')?.value || "none";
    const customFrame = frameStyle.startsWith("custom:") ? clone(customFramesCache.get(frameStyle) ?? null) : null;

    return normalizeOverlay({
      id,
      name: get('[name="name"]')?.value.trim() || "Fenêtre média",
      contentType: get('[name="contentType"]')?.value || "media",
      media: get('[name="media"]')?.value.trim() || "",
      textContent: get('[name="textContent"]')?.value || "",
      htmlContent: get('[name="htmlContent"]')?.value || "",
      textAlign: get('[name="textAlign"]')?.value || "left",
      textFontSize: Number(get('[name="textFontSize"]')?.value || 18),
      textColor: get('[name="textColor"]')?.value || "#ffffff",
      width: Number(get('[name="width"]')?.value || 60),
      widthUnit: get('[name="widthUnit"]')?.value || "vw",
      height: Number(get('[name="height"]')?.value || 0),
      heightUnit: get('[name="heightUnit"]')?.value || "auto",
      position: get('[name="position"]')?.value || "center",
      placementMode: get('[name="placementMode"]')?.value || "fixed",
      floatX: Number(get('[name="floatX"]')?.value || 50),
      floatY: Number(get('[name="floatY"]')?.value || 50),
      floatWidth: Number(get('[name="floatWidth"]')?.value || 60),
      floatHeight: Number(get('[name="floatHeight"]')?.value || 35),
      preserveRatio: Boolean(get('[name="preserveRatio"]')?.checked),
      darkBackdrop: Boolean(get('[name="darkBackdrop"]')?.checked),
      contentOpacity: Number(get('[name="contentOpacity"]')?.value || 100),
      backgroundOpacity: Number(get('[name="backgroundOpacity"]')?.value || 92),
      frameStyle,
      customFrame,
      allowPlayerClose: Boolean(get('[name="allowPlayerClose"]')?.checked),
      autoplay: Boolean(get('[name="autoplay"]')?.checked),
      loop: Boolean(get('[name="loop"]')?.checked),
      muted: Boolean(get('[name="muted"]')?.checked),
      controls: Boolean(get('[name="controls"]')?.checked),
      targetMode: get('[name="targetMode"]')?.value || "allPlayers",
      recipients: checkedRecipients,
      includeGM: Boolean(get('[name="includeGM"]')?.checked)
    });
  }

  async #saveCard(card, { render = true } = {}) {
    const current = getStoredOverlays();
    const previous = normalizeOverlay(current[card.dataset.overlayId] ?? {});
    const next = this.#readCard(card);
    next.active = previous.active;
    next.activeRecipients = previous.activeRecipients;
    current[next.id] = next;
    await setStoredOverlays(current);
    if (render) await this.render({ force: true });
    return next;
  }

  async #onClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || !this.element.contains(button)) return;
    const action = button.dataset.action;
    const card = this.#cardFromTarget(button);

    switch (action) {
      case "new": await this.#createOverlay(); break;
      case "browse": if (card) this.#browseMedia(card); break;
      case "save":
        if (card) {
          await this.#saveCard(card);
          ui.notifications.info("Fenêtre enregistrée.");
        }
        break;
      case "preview": if (card) this.#togglePreview(card); break;
      case "show": if (card) await this.#showOverlay(card); break;
      case "resetPosition": if (card) await this.#resetGeometry(card); break;
      case "reloadFrames": {
        const frames = await loadCustomFrames({ force: true });
        await this.render({ force: true });
        const count = frames.size;
        if (count === 0) {
          ui.notifications.warn(`Aucun cadre personnalisé trouvé dans Data/${CUSTOM_FRAME_ROOT}/.`);
        } else {
          ui.notifications.info(`${count} cadre${count > 1 ? "s" : ""} personnalisé${count > 1 ? "s" : ""} chargé${count > 1 ? "s" : ""}.`);
        }
        break;
      }
      case "close": if (card) await this.#closeOverlay(card.dataset.overlayId); break;
      case "delete": if (card) await this.#deleteOverlay(card.dataset.overlayId); break;
      case "closeAll": await this.#closeAll(); break;
    }
  }

  #onInput(event) {
    const card = this.#cardFromTarget(event.target);
    if (!card) return;
    if (event.target.matches('input[name="contentOpacity"], input[name="backgroundOpacity"]')) {
      const output = event.target.closest(".gmo-range-row")?.querySelector("output");
      if (output) output.textContent = `${event.target.value} %`;
    }
  }

  #onChange(event) {
    const card = this.#cardFromTarget(event.target);
    if (!card) return;

    if (event.target.matches('select[name="targetMode"]')) {
      card.classList.toggle("gmo-target-selected", event.target.value === "selected");
      return;
    }

    if (event.target.matches('select[name="placementMode"]')) {
      this.#applyPlacementClasses(card, event.target.value);
      if (event.target.value !== "fixed") this.#setFloatingInputsFromAnchor(card);
      return;
    }

    if (event.target.matches('select[name="position"]')) {
      const mode = card.querySelector('select[name="placementMode"]')?.value ?? "fixed";
      if (mode !== "fixed") this.#setFloatingInputsFromAnchor(card);
      return;
    }

    if (event.target.matches('select[name="contentType"]')) {
      this.#applyContentClasses(card, event.target.value);
    }
  }

  #applyPlacementClasses(card, mode) {
    card.classList.toggle("gmo-placement-fixed", mode === "fixed");
    card.classList.toggle("gmo-placement-gm", mode === "gm");
    card.classList.toggle("gmo-placement-player", mode === "player");
    card.classList.toggle("gmo-placement-floating", mode !== "fixed");
  }

  #applyContentClasses(card, type) {
    card.classList.toggle("gmo-content-media", type === "media");
    card.classList.toggle("gmo-content-text", type === "text");
    card.classList.toggle("gmo-content-html", type === "html");
  }

  #setFloatingInputsFromAnchor(card) {
    const position = card.querySelector('select[name="position"]')?.value || "center";
    const [x, y] = anchorPosition(position);
    const xInput = card.querySelector('[name="floatX"]');
    const yInput = card.querySelector('[name="floatY"]');
    if (xInput) xInput.value = String(x);
    if (yInput) yInput.value = String(y);
    const label = card.querySelector("[data-floating-coordinates]");
    if (label) label.textContent = `X ${x.toFixed(1)} % · Y ${y.toFixed(1)} %`;
  }

  async #createOverlay() {
    const overlays = getStoredOverlays();
    const overlay = createOverlayData();
    overlays[overlay.id] = overlay;
    await setStoredOverlays(overlays);
    await this.render({ force: true });
  }

  #browseMedia(card) {
    const input = card.querySelector('[name="media"]');
    const picker = new foundry.applications.apps.FilePicker({
      type: "imagevideo",
      current: input?.value || "",
      callback: path => { if (input) input.value = path; }
    });
    picker.render({ force: true });
  }

  #hasContent(data) {
    if (data.contentType === "media") return Boolean(data.media);
    if (data.contentType === "text") return Boolean(data.textContent?.trim());
    return Boolean(data.htmlContent?.trim());
  }

  #togglePreview(card) {
    const data = this.#readCard(card);
    if (!this.#hasContent(data)) {
      ui.notifications.warn("Ajoute d’abord un contenu à cette fenêtre.");
      return;
    }
    const previewData = { ...data, id: `preview-${data.id}`, darkBackdrop: data.darkBackdrop };
    const existing = document.getElementById(runtimeId(previewData.id));
    if (existing) existing.remove();
    else renderRuntimeOverlay(previewData, { preview: true });
  }

  async #showOverlay(card) {
    let overlay = await this.#saveCard(card, { render: false });
    if (!this.#hasContent(overlay)) {
      ui.notifications.warn("Ajoute d’abord un contenu à cette fenêtre.");
      return;
    }
    const targets = resolveTargets(overlay);
    if (!targets.length) {
      ui.notifications.warn("Aucun destinataire sélectionné.");
      return;
    }

    const overlays = getStoredOverlays();
    overlay = normalizeOverlay(overlays[overlay.id]);
    overlay.active = true;
    overlay.activeRecipients = targets;
    overlays[overlay.id] = overlay;
    await setStoredOverlays(overlays);

    broadcastPacket({ action: "sync", overlay, targets });
    const extra = overlay.placementMode === "gm" && !targets.includes(game.user.id)
      ? " Une copie de contrôle est affichée sur ton écran pour le placement et la taille."
      : "";
    ui.notifications.info(`« ${overlay.name} » envoyée à ${targets.length} destinataire(s).${extra}`);
    await this.render({ force: true });
  }

  async #resetGeometry(card) {
    let overlay = await this.#saveCard(card, { render: false });
    const [x, y] = anchorPosition(overlay.position);
    overlay.floatX = x;
    overlay.floatY = y;
    const w = overlay.floatWidth;
    const h = overlay.contentType === "media" ? null : overlay.floatHeight;

    const overlays = getStoredOverlays();
    overlays[overlay.id] = overlay;
    await setStoredOverlays(overlays);

    if (overlay.placementMode === "gm") {
      broadcastPacket({ action: "geometry", overlayId: overlay.id, x, y, w, h });
      ui.notifications.info("Position et taille MJ réinitialisées.");
    } else if (overlay.placementMode === "player") {
      const targets = overlay.active ? overlay.activeRecipients : resolveTargets(overlay);
      broadcastPacket({ action: "resetPlayerGeometry", overlayId: overlay.id, x, y, w, h, targets });
      ui.notifications.info("Position et taille locales réinitialisées chez les destinataires connectés.");
    } else {
      ui.notifications.info("Le mode fixe utilise les réglages de taille et de position du panneau.");
    }
    await this.render({ force: true });
  }

  async #closeOverlay(id) {
    const overlays = getStoredOverlays();
    if (!overlays[id]) return;
    const overlay = normalizeOverlay(overlays[id]);
    overlay.active = false;
    overlay.activeRecipients = [];
    overlays[id] = overlay;
    await setStoredOverlays(overlays);
    broadcastPacket({ action: "close", overlayId: id });
    ui.notifications.info(`« ${overlay.name} » fermée.`);
    await this.render({ force: true });
  }

  async #deleteOverlay(id) {
    const overlays = getStoredOverlays();
    const overlay = normalizeOverlay(overlays[id]);
    if (!overlay.id) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "Supprimer la fenêtre" },
      content: `<p>Supprimer définitivement <strong>${escapeHTML(overlay.name)}</strong> ?</p>`,
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    if (overlay.active) broadcastPacket({ action: "close", overlayId: id });
    delete overlays[id];
    await setStoredOverlays(overlays);
    clearPlayerPosition(id);
    clearPlayerSize(id);
    removeRuntimeOverlay(`preview-${id}`);
    await this.render({ force: true });
  }

  async #closeAll() {
    const overlays = getStoredOverlays();
    let changed = false;
    for (const [id, raw] of Object.entries(overlays)) {
      const overlay = normalizeOverlay(raw);
      if (!overlay.active) continue;
      overlay.active = false;
      overlay.activeRecipients = [];
      overlays[id] = overlay;
      changed = true;
    }
    if (changed) await setStoredOverlays(overlays);
    broadcastPacket({ action: "closeAll" });
    ui.notifications.info("Toutes les fenêtres média ont été fermées.");
    await this.render({ force: true });
  }
}

function openManager() {
  if (!game.user.isGM) return;
  if (managerInstance?.rendered) {
    managerInstance.bringToFront();
    return;
  }
  managerInstance = new MediaOverlayManager();
  managerInstance.render({ force: true });
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTING_OVERLAYS, {
    name: "Fenêtres média",
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "GEKKO — Media Overlay",
    label: "Ouvrir le gestionnaire",
    hint: "Créer et diffuser des images, vidéos, textes ou contenus HTML dans des fenêtres indépendantes au-dessus de la scène.",
    icon: "gmo-gekko-icon",
    type: MediaOverlayManager,
    restricted: true
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const orders = Object.values(controls).map(control => Number(control?.order)).filter(Number.isFinite);
  const order = orders.length ? Math.max(...orders) + 1 : 100;

  controls.gekkoMediaOverlay = {
    name: "gekkoMediaOverlay",
    title: "GEKKO — Media Overlay",
    icon: "gmo-gekko-icon",
    order,
    visible: true,
    activeTool: "openManager",
    onChange: (_event, active) => { if (active) openManager(); },
    tools: {
      openManager: {
        name: "openManager",
        title: "Ouvrir GEKKO — Media Overlay",
        icon: "gmo-gekko-icon",
        order: 0,
        button: true,
        visible: true,
        onChange: () => openManager()
      }
    }
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, applySocketPacket);
  syncLocalFromStoredState();

  window.addEventListener("resize", () => {
    document.querySelectorAll(".gmo-floating-frame").forEach(frame => {
      setFloatingFramePosition(frame, Number(frame.dataset.floatX) || 50, Number(frame.dataset.floatY) || 50);
    });
  });

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openManager,
      renderRuntimeOverlay,
      removeRuntimeOverlay,
      removeAllRuntimeOverlays,
      loadCustomFrames
    };
  }
});
