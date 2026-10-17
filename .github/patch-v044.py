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
    '    handle.innerHTML = \'<i class="fa-solid fa-up-down-left-right"></i><span>Déplacer</span>\';',
    '    handle.setAttribute("aria-label", "Déplacer cette fenêtre");\n    handle.innerHTML = \'<i class="fa-solid fa-up-down-left-right"></i>\';',
    "drag icon only"
)
js = replace_once(
    js,
    '    reset.innerHTML = \'<i class="fa-solid fa-crosshairs"></i>\';',
    '    reset.setAttribute("aria-label", "Recentrer et réinitialiser la taille");\n    reset.innerHTML = \'<i class="fa-solid fa-crosshairs"></i>\';',
    "reset aria label"
)
js = replace_once(
    js,
    '    settings.innerHTML = \'<i class="fa-solid fa-gear"></i><span>Réglages</span>\';',
    '    settings.innerHTML = \'<i class="fa-solid fa-gear"></i>\';',
    "settings icon only"
)
js_path.write_text(js, encoding="utf-8")

css_path = Path("styles/media-overlay.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace("/* GEKKO — Media Overlay v0.4.3 */", "/* GEKKO — Media Overlay v0.4.4 */", 1)
css = replace_once(
    css,
    '''.gmo-floating-chrome button {
  min-height: 26px;
  height: 26px;
  padding: 2px 7px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 6px;
  background: rgba(10, 10, 12, 0.9);
  color: #eee;
  box-shadow: 0 2px 8px #0008;
  pointer-events: auto;
}''',
    '''.gmo-floating-chrome button {
  flex: 0 0 30px;
  width: 30px;
  min-width: 30px;
  min-height: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 6px;
  background: rgba(10, 10, 12, 0.9);
  color: #eee;
  box-shadow: 0 2px 8px #0008;
  pointer-events: auto;
}''',
    "uniform chrome buttons"
)
css_path.write_text(css, encoding="utf-8")

module_path = Path("module.json")
module = json.loads(module_path.read_text(encoding="utf-8"))
module["version"] = "0.4.4"
module["download"] = "https://github.com/thegexgekko/gekko-media-overlay/releases/download/v0.4.4/gekko-media-overlay-0.4.4.zip"
module_path.write_text(json.dumps(module, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace("Version actuelle : **0.4.3**.", "Version actuelle : **0.4.4**.")
fix_line = "- **0.4.4** : uniformisation de la barre de contrôle des médias ; Déplacer, Recentrer et Réglages sont désormais des boutons compacts à icône seule.\n"
anchor = "## Correctifs\n\n"
if fix_line not in readme:
    if anchor not in readme:
        raise SystemExit("README correctifs anchor not found")
    readme = readme.replace(anchor, anchor + fix_line, 1)
readme_path.write_text(readme, encoding="utf-8")

Path(".github/patch-v044.py").unlink(missing_ok=True)
Path(".github/workflows/apply-v044.yml").unlink(missing_ok=True)
