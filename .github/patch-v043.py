from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Marker not found: {label}")
    return text.replace(old, new, 1)


js_path = Path("scripts/media-overlay.js")
js = js_path.read_text(encoding="utf-8")

js = replace_once(
    js,
    '''  const canDrag = canDragOverlay(overlay, { preview });
  const canResize = canResizeOverlay(overlay, { preview });
  const canClose = canPlayerClose(overlay, { preview, controllerOnly });
  if (!canDrag && !canResize && !canClose && !controllerOnly) return;''',
    '''  const canDrag = canDragOverlay(overlay, { preview });
  const canResize = canResizeOverlay(overlay, { preview });
  const canClose = canPlayerClose(overlay, { preview, controllerOnly });
  const canOpenSettings = !preview && Boolean(game.user?.isGM);
  if (!canDrag && !canResize && !canClose && !controllerOnly && !canOpenSettings) return;''',
    "runtime chrome permissions",
)

js = replace_once(
    js,
    '''    chrome.appendChild(reset);
  }

  if (canClose) {''',
    '''    chrome.appendChild(reset);
  }

  if (canOpenSettings) {
    const settings = document.createElement("button");
    settings.type = "button";
    settings.className = "gmo-runtime-settings";
    settings.title = "Ouvrir les réglages de cette fenêtre";
    settings.setAttribute("aria-label", "Ouvrir les réglages de cette fenêtre");
    settings.innerHTML = '<i class="fa-solid fa-gear"></i><span>Réglages</span>';
    settings.addEventListener("click", async event => {
      event.preventDefault();
      event.stopPropagation();
      await openManagerForOverlay(overlay.id);
    });
    chrome.appendChild(settings);
  }

  if (canClose) {''',
    "settings button",
)

js = replace_once(
    js,
    '''function openManager() {
  if (!game.user.isGM) return;
  if (managerInstance?.rendered) {
    managerInstance.bringToFront();
    return;
  }
  managerInstance = new MediaOverlayManager();
  managerInstance.render({ force: true });
}
''',
    '''function openManager() {
  if (!game.user.isGM) return;
  if (managerInstance?.rendered) {
    managerInstance.bringToFront();
    return;
  }
  managerInstance = new MediaOverlayManager();
  managerInstance.render({ force: true });
}

async function openManagerForOverlay(overlayId) {
  if (!game.user?.isGM || !overlayId) return;
  collapsedOverlayIds.delete(overlayId);
  openManager();
  if (!managerInstance) return;

  await managerInstance.render({ force: true });
  managerInstance.bringToFront?.();

  requestAnimationFrame(() => {
    const cards = [...(managerInstance?.element?.querySelectorAll?.("[data-overlay-id]") ?? [])];
    const card = cards.find(element => element.dataset.overlayId === overlayId);
    if (!card) return;
    card.classList.remove("gmo-collapsed");
    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    card.classList.add("gmo-settings-focus");
    window.setTimeout(() => card.classList.remove("gmo-settings-focus"), 1400);
  });
}
''',
    "open manager for overlay",
)

js = replace_once(
    js,
    '''      openManager,
      renderRuntimeOverlay,''',
    '''      openManager,
      openManagerForOverlay,
      renderRuntimeOverlay,''',
    "module api",
)

js_path.write_text(js, encoding="utf-8")

css_path = Path("styles/media-overlay.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace("/* GEKKO — Media Overlay v0.4.2 */", "/* GEKKO — Media Overlay v0.4.3 */", 1)
marker = '''.gmo-floating-chrome button span {
  margin-left: 5px;
  font-size: 11px;
  font-weight: 700;
}
'''
addition = marker + '''
.gmo-runtime-settings {
  cursor: pointer;
}

.gmo-overlay-card.gmo-settings-focus {
  outline: 2px solid rgba(255, 170, 45, 0.92);
  outline-offset: 2px;
  box-shadow: 0 0 0 1px rgba(255, 170, 45, 0.22), 0 0 18px rgba(255, 170, 45, 0.22);
}
'''
css = replace_once(css, marker, addition, "CSS chrome marker")
css_path.write_text(css, encoding="utf-8")

module_path = Path("module.json")
module = json.loads(module_path.read_text(encoding="utf-8"))
module["version"] = "0.4.3"
module["download"] = "https://github.com/thegexgekko/gekko-media-overlay/releases/download/v0.4.3/gekko-media-overlay-0.4.3.zip"
module_path.write_text(json.dumps(module, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
feature = "- Bouton Réglages réservé au MJ directement sur les fenêtres affichées, ouvrant le gestionnaire sur la fenêtre concernée.\n"
anchor = "- Les panneaux de réglage de chaque fenêtre peuvent être repliés pour faciliter la gestion de nombreuses fenêtres média.\n"
if feature not in readme:
    if anchor not in readme:
        raise SystemExit("README anchor not found")
    readme = readme.replace(anchor, anchor + feature, 1)
readme = readme.replace("Version actuelle : **0.4.2**.", "Version actuelle : **0.4.3**.")
readme_path.write_text(readme, encoding="utf-8")

Path(".github/patch-v043.py").unlink(missing_ok=True)
Path(".github/workflows/apply-v043.yml").unlink(missing_ok=True)
