const MODULE_ID = "gekko-media-overlay";
const SOCKET_NAME = `module.${MODULE_ID}`;
const SETTING_OVERLAYS = "overlays";
const RUNTIME_LAYER_ID = "gekko-media-overlay-layer";

const VIDEO_EXTENSIONS = new Set(["webm", "mp4", "m4v", "ogv", "ogg", "mov"]);

const DEFAULT_OVERLAY = Object.freeze({
  id: "",
  name: "Nouvelle fenêtre",
  media: "",
  width: 60,
  widthUnit: "vw",
  height: 0,
  heightUnit: "auto",
  position: "center",
  preserveRatio: true,
  darkBackdrop: false,
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

function getStoredOverlays() {
  const value = game.settings.get(MODULE_ID, SETTING_OVERLAYS);
  return value && typeof value === "object" ? clone(value) : {};
}

async function setStoredOverlays(overlays) {
  return game.settings.set(MODULE_ID, SETTING_OVERLAYS, clone(overlays));
}

function normalizeOverlay(data = {}) {
  const overlay = { ...clone(DEFAULT_OVERLAY), ...clone(data) };
  overlay.recipients = Array.isArray(overlay.recipients) ? overlay.recipients : [];
  overlay.activeRecipients = Array.isArray(overlay.activeRecipients) ? overlay.activeRecipients : [];
  overlay.width = Number.isFinite(Number(overlay.width)) ? Number(overlay.width) : DEFAULT_OVERLAY.width;
  overlay.height = Number.isFinite(Number(overlay.height)) ? Number(overlay.height) : DEFAULT_OVERLAY.height;
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

function buildMediaElement(overlay) {
  const type = detectMediaType(overlay.media);
  let element;

  if (type === "video") {
    element = document.createElement("video");
    element.src = overlay.media;
    element.autoplay = Boolean(overlay.autoplay);
    element.loop = Boolean(overlay.loop);
    element.muted = Boolean(overlay.muted);
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
  return element;
}

function renderRuntimeOverlay(rawOverlay, { preview = false } = {}) {
  const overlay = normalizeOverlay(rawOverlay);
  if (!overlay.id || !overlay.media) return;

  removeRuntimeOverlay(overlay.id);

  const layer = getRuntimeLayer();
  const root = document.createElement("div");
  root.id = runtimeId(overlay.id);
  root.className = "gmo-runtime";
  root.dataset.overlayId = overlay.id;
  root.dataset.preview = preview ? "true" : "false";

  if (overlay.darkBackdrop) {
    const backdrop = document.createElement("div");
    backdrop.className = "gmo-runtime-backdrop";
    root.appendChild(backdrop);
  }

  const frame = document.createElement("div");
  frame.className = `gmo-runtime-frame gmo-pos-${positionClass(overlay.position)}`;
  frame.style.width = cssDimension(overlay.width, overlay.widthUnit, "width");
  frame.style.height = cssDimension(overlay.height, overlay.heightUnit, "height");

  if (overlay.preserveRatio) frame.classList.add("gmo-preserve-ratio");

  const media = buildMediaElement(overlay);
  frame.appendChild(media);

  if (preview) {
    const label = document.createElement("div");
    label.className = "gmo-preview-label";
    label.textContent = "APERÇU MJ — cliquer pour fermer";
    frame.appendChild(label);
    frame.style.pointerEvents = "auto";
    frame.addEventListener("click", event => {
      if (event.target.closest("video")) return;
      root.remove();
    });
  }

  root.appendChild(frame);
  layer.appendChild(root);
}

function resolveTargets(overlay) {
  const targets = new Set();

  if (overlay.targetMode === "allPlayers") {
    for (const user of game.users) {
      if (!user.isGM) targets.add(user.id);
    }
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
      if (targets.includes(game.user.id)) renderRuntimeOverlay(overlay);
      else removeRuntimeOverlay(overlay.id);
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
    if (overlay.activeRecipients.includes(game.user.id)) renderRuntimeOverlay(overlay);
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
    ["top-left", "Haut gauche"],
    ["top", "Haut"],
    ["top-right", "Haut droite"],
    ["left", "Gauche"],
    ["center", "Centre"],
    ["right", "Droite"],
    ["bottom-left", "Bas gauche"],
    ["bottom", "Bas"],
    ["bottom-right", "Bas droite"]
  ];
  return options.map(([value, label]) => ({ value, label, selected: current === value }));
}

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

class MediaOverlayManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "gekko-media-overlay-manager",
    classes: ["gekko-media-overlay-manager"],
    position: {
      width: 760,
      height: 780
    },
    window: {
      icon: "gmo-gekko-icon",
      title: "GEKKO — Media Overlay"
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/manager.hbs`
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const stored = getStoredOverlays();
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
        statusLabel: overlay.active ? `Affichée (${activeCount})` : "Fermée",
        widthUnits: unitOptions(overlay.widthUnit, "width"),
        heightUnits: unitOptions(overlay.heightUnit, "height"),
        positions: positionOptions(overlay.position),
        users: users.map(user => ({
          id: user.id,
          name: user.name,
          active: user.active,
          selected: recipients.has(user.id)
        }))
      };
    });

    overlays.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));

    return {
      ...context,
      overlays,
      hasOverlays: overlays.length > 0
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    managerInstance = this;

    // Conserver des références stables afin de ne pas empiler les écouteurs
    // à chaque re-render de l'ApplicationV2. Sans cela, un seul clic peut
    // déclencher plusieurs fois la même action (par ex. plusieurs dialogues
    // de confirmation superposés lors d'une suppression).
    this._boundOnClick ??= this.#onClick.bind(this);
    this._boundOnChange ??= this.#onChange.bind(this);

    this.element.removeEventListener("click", this._boundOnClick);
    this.element.removeEventListener("change", this._boundOnChange);
    this.element.addEventListener("click", this._boundOnClick);
    this.element.addEventListener("change", this._boundOnChange);
  }

  #cardFromTarget(target) {
    return target.closest("[data-overlay-id]");
  }

  #readCard(card) {
    const id = card.dataset.overlayId;
    const get = selector => card.querySelector(selector);
    const checkedRecipients = [...card.querySelectorAll('input[name="recipient"]:checked')].map(input => input.value);

    return normalizeOverlay({
      id,
      name: get('[name="name"]')?.value.trim() || "Fenêtre média",
      media: get('[name="media"]')?.value.trim() || "",
      width: Number(get('[name="width"]')?.value || 60),
      widthUnit: get('[name="widthUnit"]')?.value || "vw",
      height: Number(get('[name="height"]')?.value || 0),
      heightUnit: get('[name="heightUnit"]')?.value || "auto",
      position: get('[name="position"]')?.value || "center",
      preserveRatio: Boolean(get('[name="preserveRatio"]')?.checked),
      darkBackdrop: Boolean(get('[name="darkBackdrop"]')?.checked),
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
      case "new":
        await this.#createOverlay();
        break;
      case "browse":
        if (card) this.#browseMedia(card);
        break;
      case "save":
        if (card) {
          await this.#saveCard(card);
          ui.notifications.info("Fenêtre enregistrée.");
        }
        break;
      case "preview":
        if (card) this.#togglePreview(card);
        break;
      case "show":
        if (card) await this.#showOverlay(card);
        break;
      case "close":
        if (card) await this.#closeOverlay(card.dataset.overlayId);
        break;
      case "delete":
        if (card) await this.#deleteOverlay(card.dataset.overlayId);
        break;
      case "closeAll":
        await this.#closeAll();
        break;
    }
  }

  #onChange(event) {
    const select = event.target.closest('select[name="targetMode"]');
    if (!select) return;
    const card = this.#cardFromTarget(select);
    card?.classList.toggle("gmo-target-selected", select.value === "selected");
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
      callback: path => {
        if (input) input.value = path;
      }
    });
    picker.render({ force: true });
  }

  #togglePreview(card) {
    const data = this.#readCard(card);
    if (!data.media) {
      ui.notifications.warn("Choisis d’abord une image ou une vidéo.");
      return;
    }

    const previewData = { ...data, id: `preview-${data.id}`, darkBackdrop: data.darkBackdrop };
    const existing = document.getElementById(runtimeId(previewData.id));
    if (existing) existing.remove();
    else renderRuntimeOverlay(previewData, { preview: true });
  }

  async #showOverlay(card) {
    let overlay = await this.#saveCard(card, { render: false });
    if (!overlay.media) {
      ui.notifications.warn("Choisis d’abord une image ou une vidéo.");
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
    ui.notifications.info(`« ${overlay.name} » envoyée à ${targets.length} destinataire(s).`);
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
    hint: "Créer et diffuser des images ou vidéos dans des fenêtres indépendantes au-dessus de la scène.",
    icon: "gmo-gekko-icon",
    type: MediaOverlayManager,
    restricted: true
  });
});

Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;

  const orders = Object.values(controls)
    .map(control => Number(control?.order))
    .filter(Number.isFinite);
  const order = orders.length ? Math.max(...orders) + 1 : 100;

  controls.gekkoMediaOverlay = {
    name: "gekkoMediaOverlay",
    title: "GEKKO — Media Overlay",
    icon: "gmo-gekko-icon",
    order,
    visible: true,
    activeTool: "openManager",
    onChange: (_event, active) => {
      // Le bouton principal de la barre de gauche ouvre directement le gestionnaire.
      if (active) openManager();
    },
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

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      openManager,
      renderRuntimeOverlay,
      removeRuntimeOverlay,
      removeAllRuntimeOverlays
    };
  }
});
