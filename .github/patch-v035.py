from pathlib import Path
import re


def rep(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Marker not found: {label}")
    return text.replace(old, new, 1)


js_path = Path("scripts/media-overlay.js")
js = js_path.read_text(encoding="utf-8")

js = rep(
    js,
    '  frameStyle: "none",\n  customFrame: null,\n  allowPlayerClose: false,',
    '  frameStyle: "none",\n  customFrame: null,\n  customFrameThickness: 18,\n  allowPlayerClose: false,',
    "default thickness",
)

js = rep(
    js,
    '  overlay.customFrame = overlay.customFrame && typeof overlay.customFrame === "object" ? clone(overlay.customFrame) : null;\n  overlay.allowPlayerClose = Boolean(overlay.allowPlayerClose);',
    '  overlay.customFrame = overlay.customFrame && typeof overlay.customFrame === "object" ? clone(overlay.customFrame) : null;\n  overlay.customFrameThickness = clamp(safeNumber(overlay.customFrameThickness, 18), 4, 64);\n  overlay.allowPlayerClose = Boolean(overlay.allowPlayerClose);',
    "normalize thickness",
)

simple_pattern = re.compile(
    r'  // Mode simple \(image déposée directement dans frames/\).*?\n  if \(def\.mode === "overlay"\) \{.*?\n  \}',
    re.S,
)
simple_new = '''  // Mode simple : 9-slice automatique. Les coins restent intacts et seuls les bords
  // s'étirent pour suivre le ratio de la fenêtre. Aucun frame.json n'est nécessaire.
  if (def.mode === "overlay" || def.mode === "auto9") {
    frame.classList.add("gmo-frame-custom-auto");
    frame.style.setProperty("--gmo-custom-frame-image", `url("${image.replaceAll('"', '%22')}")`);
    frame.style.setProperty("--gmo-custom-frame-slice", `${safeFrameValue(def.slicePercent, 12, 4, 30)}%`);
    frame.style.setProperty("--gmo-custom-frame-width", `${safeFrameValue(overlay.customFrameThickness, 18, 4, 64)}px`);
    frame.style.border = "0";
    frame.style.padding = "0";
    frame.style.borderRadius = "0";
    return;
  }'''
js, n = simple_pattern.subn(simple_new, js, count=1)
if n != 1:
    raise SystemExit("Marker not found: simple frame block")

js = rep(
    js,
    '        image: resolveFoundryPath(file),\n        mode: "overlay"\n      });',
    '        image: resolveFoundryPath(file),\n        mode: "auto9",\n        slicePercent: 12\n      });',
    "loader auto9",
)

js = rep(
    js,
    '        isHtmlContent: overlay.contentType === "html",\n        statusLabel:',
    '        isHtmlContent: overlay.contentType === "html",\n        isCustomFrame: overlay.frameStyle.startsWith("custom:"),\n        statusLabel:',
    "context flag",
)

js = rep(
    js,
    '      frameStyle,\n      customFrame,\n      allowPlayerClose:',
    '      frameStyle,\n      customFrame,\n      customFrameThickness: Number(get(\'[name="customFrameThickness"]\')?.value || 18),\n      allowPlayerClose:',
    "read thickness",
)

js = rep(
    js,
    '''    if (event.target.matches('input[name="contentOpacity"], input[name="backgroundOpacity"]')) {
      const output = event.target.closest(".gmo-range-row")?.querySelector("output");
      if (output) output.textContent = `${event.target.value} %`;
    }''',
    '''    if (event.target.matches('input[name="contentOpacity"], input[name="backgroundOpacity"], input[name="customFrameThickness"]')) {
      const output = event.target.closest(".gmo-range-row")?.querySelector("output");
      if (output) output.textContent = event.target.name === "customFrameThickness"
        ? `${event.target.value} px`
        : `${event.target.value} %`;
    }''',
    "range output",
)

js = rep(
    js,
    '''    if (event.target.matches('select[name="targetMode"]')) {''',
    '''    if (event.target.matches('select[name="frameStyle"]')) {
      card.classList.toggle("gmo-frame-custom-selected", event.target.value.startsWith("custom:"));
      return;
    }

    if (event.target.matches('select[name="targetMode"]')) {''',
    "frame change",
)

resize_button = re.compile(
    r'\n  if \(canResize\) \{\n    const resize = document\.createElement\("button"\);.*?setupResizing\(resize, frame, overlay\);\n  \}\n',
    re.S,
)
js, n = resize_button.subn("\n", js, count=1)
if n != 1:
    raise SystemExit("Marker not found: top resize button")

js = rep(
    js,
    '  frame.appendChild(chrome);\n}',
    '''  frame.appendChild(chrome);

  if (canResize) {
    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "gmo-resize-corner";
    resize.title = overlay.contentType === "media"
      ? "Redimensionner depuis le coin inférieur droit (ratio conservé)"
      : "Redimensionner depuis le coin inférieur droit";
    resize.setAttribute("aria-label", "Redimensionner");
    resize.innerHTML = '<i class="fa-solid fa-up-right-and-down-left-from-center"></i>';
    frame.appendChild(resize);
    setupResizing(resize, frame, overlay);
  }
}''',
    "corner handle",
)

resize_pattern = re.compile(
    r'function setupResizing\(handle, frame, overlay\) \{.*?\n\}\n\nfunction renderRuntimeOverlay',
    re.S,
)
resize_new = r'''function setupResizing(handle, frame, overlay) {
  handle.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startRect = frame.getBoundingClientRect();
    const anchorLeft = startRect.left;
    const anchorTop = startRect.top;
    const ratio = startRect.height > 0 ? startRect.width / startRect.height : 16 / 9;
    frame.classList.add("is-resizing");
    handle.setPointerCapture?.(event.pointerId);

    let latest = {
      x: Number(frame.dataset.floatX) || 50,
      y: Number(frame.dataset.floatY) || 50,
      w: Number(frame.dataset.floatWidth) || overlay.floatWidth,
      h: frame.dataset.floatHeight ? Number(frame.dataset.floatHeight) : null
    };
    let rafPending = false;

    const onMove = moveEvent => {
      let pxW = Math.max(120, moveEvent.clientX - anchorLeft);
      let pxH = Math.max(80, moveEvent.clientY - anchorTop);

      if (overlay.contentType === "media") {
        const projectedH = ((pxW * ratio) + pxH) / ((ratio * ratio) + 1);
        pxH = Math.max(80, projectedH);
        pxW = Math.max(120, pxH * ratio);
        pxH = pxW / ratio;
      }

      const w = window.innerWidth ? (pxW / window.innerWidth) * 100 : overlay.floatWidth;
      const h = overlay.contentType === "media"
        ? null
        : (window.innerHeight ? (pxH / window.innerHeight) * 100 : overlay.floatHeight);
      const size = setFloatingFrameSize(frame, overlay, w, h);

      const resizedRect = frame.getBoundingClientRect();
      const centerX = anchorLeft + resizedRect.width / 2;
      const centerY = anchorTop + resizedRect.height / 2;
      const x = window.innerWidth ? (centerX / window.innerWidth) * 100 : 50;
      const y = window.innerHeight ? (centerY / window.innerHeight) * 100 : 50;
      const pos = setFloatingFramePosition(frame, x, y);
      latest = { ...size, ...pos };

      if (overlay.placementMode === "gm" && game.user.isGM && !rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          broadcastPacket({ action: "geometry", overlayId: overlay.id, ...latest });
        });
      }
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      frame.classList.remove("is-resizing");

      if (overlay.placementMode === "gm" && game.user.isGM) {
        broadcastPacket({ action: "geometry", overlayId: overlay.id, ...latest });
        await persistGMGeometry(overlay.id, latest);
      } else if (overlay.placementMode === "player") {
        setPlayerPosition(overlay.id, latest.x, latest.y);
        setPlayerSize(overlay.id, latest.w, latest.h);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  });
}

function renderRuntimeOverlay'''
js, n = resize_pattern.subn(resize_new, js, count=1)
if n != 1:
    raise SystemExit("Marker not found: resize function")

js_path.write_text(js, encoding="utf-8")


tpl_path = Path("templates/manager.hbs")
tpl = tpl_path.read_text(encoding="utf-8")
tpl = rep(
    tpl,
    '{{#if isHtmlContent}}gmo-content-html{{/if}}" data-overlay-id=',
    '{{#if isHtmlContent}}gmo-content-html{{/if}} {{#if isCustomFrame}}gmo-frame-custom-selected{{/if}}" data-overlay-id=',
    "template class",
)

marker = '''          </div>

          <div class="gmo-field gmo-field-wide gmo-media-content-field">
            <label>Média</label>'''
insert = '''          </div>

          <div class="gmo-field gmo-custom-frame-options">
            <label>Épaisseur du cadre personnalisé</label>
            <div class="gmo-range-row">
              <input name="customFrameThickness" type="range" min="6" max="48" step="1" value="{{customFrameThickness}}">
              <output>{{customFrameThickness}} px</output>
            </div>
            <small class="gmo-field-help">Ajuste l'épaisseur du 9-slice automatique autour du média.</small>
          </div>

          <div class="gmo-field gmo-field-wide gmo-media-content-field">
            <label>Média</label>'''
tpl = rep(tpl, marker, insert, "template thickness")
tpl_path.write_text(tpl, encoding="utf-8")


css_path = Path("styles/media-overlay.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace("/* GEKKO — Media Overlay v0.3.3 */", "/* GEKKO — Media Overlay v0.3.5 */", 1)
css = rep(
    css,
    ".gmo-media-content-field,\n.gmo-text-content-field,",
    ".gmo-custom-frame-options,\n.gmo-media-content-field,\n.gmo-text-content-field,",
    "css hide options",
)
css = rep(
    css,
    '''.gmo-content-media .gmo-media-content-field,
.gmo-content-media .gmo-video-options {
  display: block;
}
''',
    '''.gmo-content-media .gmo-media-content-field,
.gmo-content-media .gmo-video-options {
  display: block;
}

.gmo-frame-custom-selected .gmo-custom-frame-options {
  display: block;
}
''',
    "css show options",
)

old_frame = '''/* Cadres personnalisés simples : le visuel est agrandi autour du média
   afin que la bordure décorative encadre le contenu au lieu de le recouvrir. */
.gmo-frame-custom-overlay {
  overflow: visible;
}

.gmo-frame-custom-overlay::after {
  content: "";
  position: absolute;
  inset: calc(var(--gmo-custom-frame-outset, 6%) * -1);
  z-index: 4;
  background-image: var(--gmo-custom-frame-image);
  background-position: center;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  pointer-events: none;
}'''
new_frame = '''/* Cadres personnalisés simples : 9-slice automatique.
   Les coins restent intacts, les bords s'étirent et le centre reste libre. */
.gmo-frame-custom-auto {
  overflow: visible;
}

.gmo-frame-custom-auto::after {
  content: "";
  position: absolute;
  inset: calc(var(--gmo-custom-frame-width, 18px) * -1);
  z-index: 4;
  border-style: solid;
  border-width: var(--gmo-custom-frame-width, 18px);
  border-image-source: var(--gmo-custom-frame-image);
  border-image-slice: var(--gmo-custom-frame-slice, 12%);
  border-image-width: 1;
  border-image-repeat: stretch;
  box-sizing: border-box;
  pointer-events: none;
}'''
css = rep(css, old_frame, new_frame, "css 9slice")

css += '''

/* Poignée de redimensionnement : coin inférieur droit. */
.gmo-resize-corner {
  position: absolute;
  right: 5px;
  bottom: 5px;
  z-index: 7;
  width: 26px;
  height: 26px;
  min-width: 26px;
  min-height: 26px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  background: rgba(10, 10, 12, 0.88);
  color: #eee;
  box-shadow: 0 2px 8px #0008;
  cursor: nwse-resize;
  opacity: 0;
  transition: opacity 120ms ease, transform 120ms ease;
  pointer-events: auto;
  touch-action: none;
}

.gmo-runtime-frame:hover .gmo-resize-corner,
.gmo-runtime-frame.is-resizing .gmo-resize-corner,
.gmo-resize-corner:focus-visible {
  opacity: 1;
}

.gmo-runtime-frame.is-resizing .gmo-resize-corner {
  transform: scale(1.08);
}
'''
css_path.write_text(css, encoding="utf-8")


readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "- Redimensionnement direct des fenêtres flottantes.",
    "- Redimensionnement direct par une poignée placée en bas à droite des fenêtres flottantes.",
    1,
)
readme = readme.replace(
    "Le nom affiché est dérivé automatiquement du nom du fichier. En mode simple, l'image est conservée entière et dessinée autour de la fenêtre : la bordure décorative encadre le média au lieu de venir le recouvrir.",
    "Le nom affiché est dérivé automatiquement du nom du fichier. En mode simple, le module applique automatiquement un découpage 9-slice : les quatre coins restent intacts et seuls les bords s'étirent pour s'adapter au ratio du média. L'épaisseur peut être ajustée directement dans le gestionnaire.",
    1,
)
readme = re.sub(r"Version actuelle : \*\*0\.3\.[0-9]+\*\*\.", "Version actuelle : **0.3.5**.", readme)
readme_path.write_text(readme, encoding="utf-8")
