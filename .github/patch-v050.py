from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Marker not found: {label}")
    return text.replace(old, new, 1)

js_path = Path("scripts/media-overlay.js")
js = js_path.read_text(encoding="utf-8")

js = replace_once(
    js,
    'const SETTING_OVERLAYS = "overlays";\n',
    'const SETTING_OVERLAYS = "overlays";\nconst SETTING_PRESETS = "presets";\nconst PRESET_SLOT_COUNT = 4;\n',
    "preset constants",
)

js = replace_once(
    js,
    '''async function setStoredOverlays(overlays) {\n  return game.settings.set(MODULE_ID, SETTING_OVERLAYS, clone(overlays));\n}\n''',
    '''async function setStoredOverlays(overlays) {\n  return game.settings.set(MODULE_ID, SETTING_OVERLAYS, clone(overlays));\n}\n\nfunction getStoredPresets() {\n  const value = game.settings.get(MODULE_ID, SETTING_PRESETS);\n  return value && typeof value === "object" ? clone(value) : {};\n}\n\nasync function setStoredPresets(presets) {\n  return game.settings.set(MODULE_ID, SETTING_PRESETS, clone(presets));\n}\n''',
    "preset storage helpers",
)

old_return = '    overlays.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));\n    return { ...context, overlays, hasOverlays: overlays.length > 0, customFrameRoot: CUSTOM_FRAME_ROOT };\n'
new_return = '''    overlays.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));\n\n    const storedPresets = getStoredPresets();\n    const presetSlots = Array.from({ length: PRESET_SLOT_COUNT }, (_, index) => {\n      const slot = String(index + 1);\n      const saved = storedPresets[slot];\n      return {\n        slot,\n        name: String(saved?.name || `Préréglage ${slot}`),\n        hasPreset: Boolean(saved?.overlay)\n      };\n    });\n    const presetSources = overlays.map(overlay => ({ value: overlay.id, label: overlay.name }));\n\n    return {\n      ...context,\n      overlays,\n      hasOverlays: overlays.length > 0,\n      customFrameRoot: CUSTOM_FRAME_ROOT,\n      presetSlots,\n      presetSources,\n      hasPresetSources: presetSources.length > 0\n    };\n'''
js = replace_once(js, old_return, new_return, "prepare preset context")

js = replace_once(
    js,
    '      case "new": await this.#createOverlay(); break;\n',
    '''      case "new": await this.#createOverlay(); break;\n      case "usePreset": await this.#usePreset(button); break;\n      case "savePreset": await this.#savePreset(button); break;\n      case "clearPreset": await this.#clearPreset(button); break;\n''',
    "preset click actions",
)

create_method = '''  async #createOverlay() {\n    const overlays = getStoredOverlays();\n    const overlay = createOverlayData();\n    collapsedOverlayIds.delete(overlay.id);\n    overlays[overlay.id] = overlay;\n    await setStoredOverlays(overlays);\n    await this.render({ force: true });\n  }\n'''
new_methods = create_method + '''\n  #presetSlot(button) {\n    const slot = String(button?.dataset?.presetSlot || "");\n    return Array.from({ length: PRESET_SLOT_COUNT }, (_, index) => String(index + 1)).includes(slot) ? slot : null;\n  }\n\n  #presetContainer(button) {\n    return button?.closest?.("[data-preset-slot]") ?? null;\n  }\n\n  async #savePreset(button) {\n    const slot = this.#presetSlot(button);\n    const container = this.#presetContainer(button);\n    if (!slot || !container) return;\n\n    const sourceId = this.element.querySelector("[data-preset-source]")?.value || "";\n    if (!sourceId) {\n      ui.notifications.warn("Choisis d’abord une fenêtre source pour ce préréglage.");\n      return;\n    }\n\n    const sourceCard = [...this.element.querySelectorAll("[data-overlay-id]")]\n      .find(card => card.dataset.overlayId === sourceId);\n    if (!sourceCard) {\n      ui.notifications.warn("La fenêtre source est introuvable.");\n      return;\n    }\n\n    const source = this.#readCard(sourceCard);\n    const nameInput = container.querySelector("[data-preset-name]");\n    const name = nameInput?.value?.trim() || source.name || `Préréglage ${slot}`;\n    const snapshot = normalizeOverlay(source);\n    snapshot.id = "";\n    snapshot.active = false;\n    snapshot.activeRecipients = [];\n\n    const presets = getStoredPresets();\n    presets[slot] = { name, overlay: snapshot };\n    await setStoredPresets(presets);\n    ui.notifications.info(`Préréglage « ${name} » enregistré.`);\n    await this.render({ force: true });\n  }\n\n  async #usePreset(button) {\n    const slot = this.#presetSlot(button);\n    if (!slot) return;\n    const presets = getStoredPresets();\n    const saved = presets[slot];\n    if (!saved?.overlay) {\n      ui.notifications.warn("Ce préréglage est vide.");\n      return;\n    }\n\n    const overlays = getStoredOverlays();\n    const overlay = normalizeOverlay({\n      ...clone(saved.overlay),\n      id: foundry.utils.randomID(),\n      name: String(saved.name || saved.overlay.name || `Préréglage ${slot}`)\n    });\n    overlay.active = false;\n    overlay.activeRecipients = [];\n    collapsedOverlayIds.delete(overlay.id);\n    overlays[overlay.id] = overlay;\n    await setStoredOverlays(overlays);\n    ui.notifications.info(`Nouvelle fenêtre créée depuis « ${overlay.name} ».`);\n    await this.render({ force: true });\n  }\n\n  async #clearPreset(button) {\n    const slot = this.#presetSlot(button);\n    if (!slot) return;\n    const presets = getStoredPresets();\n    const saved = presets[slot];\n    if (!saved?.overlay) return;\n\n    const confirmed = await DialogV2.confirm({\n      window: { title: "Vider le préréglage" },\n      content: `<p>Vider le préréglage <strong>${escapeHTML(saved.name || `Préréglage ${slot}`)}</strong> ?</p>`,\n      rejectClose: false,\n      modal: true\n    });\n    if (!confirmed) return;\n\n    delete presets[slot];\n    await setStoredPresets(presets);\n    ui.notifications.info("Préréglage vidé.");\n    await this.render({ force: true });\n  }\n'''
js = replace_once(js, create_method, new_methods, "preset methods")

register_marker = '''  game.settings.register(MODULE_ID, SETTING_OVERLAYS, {\n    name: "Fenêtres média",\n    scope: "world",\n    config: false,\n    type: Object,\n    default: {}\n  });\n'''
register_new = register_marker + '''\n  game.settings.register(MODULE_ID, SETTING_PRESETS, {\n    name: "Préréglages rapides",\n    scope: "world",\n    config: false,\n    type: Object,\n    default: {}\n  });\n'''
js = replace_once(js, register_marker, register_new, "register preset setting")
js_path.write_text(js, encoding="utf-8")

hbs_path = Path("templates/manager.hbs")
hbs = hbs_path.read_text(encoding="utf-8")
header_marker = '''  </header>\n\n  {{#unless hasOverlays}}\n'''
preset_markup = '''  </header>\n\n  <section class="gmo-preset-panel">\n    <div class="gmo-preset-heading">\n      <div>\n        <strong><i class="fa-solid fa-wand-magic-sparkles"></i> Préréglages rapides</strong>\n        <small>Choisis une fenêtre source, sauvegarde sa configuration dans l’un des quatre emplacements, puis recrée-la en un clic.</small>\n      </div>\n      <label class="gmo-preset-source">\n        <span>Fenêtre source</span>\n        <select data-preset-source {{#unless hasPresetSources}}disabled{{/unless}}>\n          {{#if hasPresetSources}}\n            {{#each presetSources}}\n              <option value="{{value}}">{{label}}</option>\n            {{/each}}\n          {{else}}\n            <option value="">Aucune fenêtre disponible</option>\n          {{/if}}\n        </select>\n      </label>\n    </div>\n\n    <div class="gmo-preset-grid">\n      {{#each presetSlots}}\n        <div class="gmo-preset-slot {{#if hasPreset}}is-configured{{/if}}" data-preset-slot="{{slot}}">\n          <input type="text" data-preset-name value="{{name}}" maxlength="40" aria-label="Nom du préréglage {{slot}}">\n          <div class="gmo-preset-actions">\n            <button type="button" data-action="usePreset" data-preset-slot="{{slot}}" title="Créer une nouvelle fenêtre depuis ce préréglage" {{#unless hasPreset}}disabled{{/unless}}>\n              <i class="fa-solid fa-wand-magic-sparkles"></i>\n            </button>\n            <button type="button" data-action="savePreset" data-preset-slot="{{slot}}" title="Enregistrer la fenêtre source dans ce préréglage" {{#unless ../hasPresetSources}}disabled{{/unless}}>\n              <i class="fa-solid fa-floppy-disk"></i>\n            </button>\n            <button type="button" data-action="clearPreset" data-preset-slot="{{slot}}" title="Vider ce préréglage" {{#unless hasPreset}}disabled{{/unless}}>\n              <i class="fa-solid fa-trash"></i>\n            </button>\n          </div>\n        </div>\n      {{/each}}\n    </div>\n  </section>\n\n  {{#unless hasOverlays}}\n'''
hbs = replace_once(hbs, header_marker, preset_markup, "preset template zone")
hbs_path.write_text(hbs, encoding="utf-8")

css_path = Path("styles/media-overlay.css")
css = css_path.read_text(encoding="utf-8")
css = css.replace("/* GEKKO — Media Overlay v0.4.4 */", "/* GEKKO — Media Overlay v0.5.0 */", 1)
css_marker = '''.gmo-toolbar-actions {\n  flex-wrap: wrap;\n  justify-content: flex-end;\n}\n'''
css_add = css_marker + '''\n.gmo-preset-panel {\n  flex: 0 0 auto;\n  padding: 10px 12px;\n  border: 1px solid var(--color-border-light-2, #7776);\n  border-radius: 8px;\n  background: color-mix(in srgb, var(--color-bg, #191919) 88%, transparent);\n  box-shadow: 0 2px 8px #0002;\n}\n\n.gmo-preset-heading {\n  display: flex;\n  align-items: end;\n  justify-content: space-between;\n  gap: 14px;\n  margin-bottom: 9px;\n}\n\n.gmo-preset-heading > div {\n  min-width: 0;\n}\n\n.gmo-preset-heading strong {\n  display: block;\n  margin-bottom: 2px;\n}\n\n.gmo-preset-heading small {\n  display: block;\n  opacity: 0.68;\n  line-height: 1.25;\n}\n\n.gmo-preset-source {\n  flex: 0 0 250px;\n}\n\n.gmo-preset-source > span {\n  display: block;\n  margin-bottom: 3px;\n  font-size: 0.82em;\n  font-weight: 600;\n  opacity: 0.78;\n}\n\n.gmo-preset-source select {\n  width: 100%;\n}\n\n.gmo-preset-grid {\n  display: grid;\n  grid-template-columns: repeat(4, minmax(0, 1fr));\n  gap: 8px;\n}\n\n.gmo-preset-slot {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 6px;\n  padding: 6px;\n  border: 1px solid rgba(255, 255, 255, 0.10);\n  border-radius: 7px;\n  background: rgba(0, 0, 0, 0.16);\n}\n\n.gmo-preset-slot.is-configured {\n  border-color: rgba(255, 170, 45, 0.42);\n  background: rgba(255, 170, 45, 0.055);\n}\n\n.gmo-preset-slot input {\n  width: 100%;\n  min-width: 0;\n  height: 30px;\n  font-weight: 650;\n}\n\n.gmo-preset-actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.gmo-preset-actions button {\n  flex: 0 0 28px;\n  width: 28px;\n  min-width: 28px;\n  height: 28px;\n  min-height: 28px;\n  padding: 0;\n  display: grid;\n  place-items: center;\n}\n\n.gmo-preset-actions button:disabled {\n  opacity: 0.35;\n}\n'''
css = replace_once(css, css_marker, css_add, "preset css")
css_path.write_text(css, encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
feature_anchor = "- Plusieurs fenêtres simultanées.\n"
feature = "- Quatre préréglages rapides personnalisables permettent de mémoriser une configuration de fenêtre et d’en recréer une copie en un clic.\n"
if feature not in readme:
    readme = replace_once(readme, feature_anchor, feature_anchor + feature, "README preset feature")
correctif_anchor = "## Correctifs\n\n"
correctif = "- **0.5.0** : ajout de quatre préréglages rapides personnalisables, avec nom, fenêtre source, sauvegarde, recréation et suppression du preset.\n"
if correctif not in readme:
    readme = replace_once(readme, correctif_anchor, correctif_anchor + correctif, "README v0.5.0")
readme = readme.replace("Version actuelle : **0.4.4**.", "Version actuelle : **0.5.0**.")
readme_path.write_text(readme, encoding="utf-8")

Path(".github/patch-v050.py").unlink(missing_ok=True)
Path(".github/workflows/apply-v050.yml").unlink(missing_ok=True)
