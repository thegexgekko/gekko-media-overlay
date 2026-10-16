# GEKKO — Media Overlay

Module Foundry VTT V14 permettant au MJ d'afficher des images, vidéos, textes et contenus HTML simples dans plusieurs fenêtres indépendantes au-dessus de la scène.

## Fonctions principales

- Plusieurs fenêtres simultanées.
- Contenus : image, vidéo, texte ou HTML simple filtré.
- Ciblage de tous les joueurs ou de joueurs sélectionnés.
- Trois modes de placement : fixe, flottant contrôlé par le MJ, flottant contrôlé par chaque joueur.
- Déplacement direct à la souris.
- Redimensionnement direct des fenêtres flottantes.
- Ratio des images et vidéos toujours conservé lors du redimensionnement.
- Taille et position synchronisées en direct en mode MJ.
- Taille et position indépendantes et mémorisées localement en mode joueur.
- Opacité du contenu et opacité du fond de fenêtre réglables séparément.
- Bouton de fermeture local côté joueur, activable fenêtre par fenêtre par le MJ.
- Cadres intégrés : Aucun, Sobre, Métal, Holographique, Terminal et Fantasy.
- Cadres personnalisés chargés depuis le dossier Data de Foundry.
- Aperçu MJ.
- Bouton dédié dans la barre de contrôles de scène.

## Installation par manifeste

Dans Foundry VTT, utiliser :

`https://raw.githubusercontent.com/thegexgekko/gekko-media-overlay/main/module.json`

Foundry peut ensuite détecter les nouvelles versions publiées sur GitHub.

## Cadres personnalisés

Pour éviter qu'une mise à jour du module supprime les fichiers personnels, les cadres personnalisés sont chargés depuis :

`Data/gekko-media-overlay/frames/`

Créer un sous-dossier par cadre, par exemple :

```text
Data/
└── gekko-media-overlay/
    └── frames/
        └── nova-holo/
            ├── frame.png
            └── frame.json
```

Exemple de `frame.json` :

```json
{
  "name": "Nova Holographique",
  "image": "frame.png",
  "slice": 32,
  "width": 14,
  "padding": 10,
  "radius": 6,
  "repeat": "stretch"
}
```

- `image` : image PNG, WebP ou SVG utilisée comme `border-image`.
- `slice` : découpe 9-slice du cadre.
- `width` : épaisseur du cadre en pixels.
- `padding` : espace intérieur entre le cadre et le contenu.
- `radius` : rayon des coins.
- `repeat` : `stretch`, `repeat`, `round` ou `space`.

Après avoir ajouté ou modifié un cadre, ouvrir le gestionnaire et cliquer sur **Cadres perso** pour recharger la liste.

## HTML simple

Le mode HTML autorise volontairement un sous-ensemble limité : titres, paragraphes, gras, italique, listes, liens, images, tableaux simples, code et citations. Les scripts, gestionnaires d'événements JavaScript, styles inline, classes et identifiants sont supprimés avant affichage.

## Publication

Le workflow GitHub Actions `.github/workflows/release.yml` crée automatiquement une release quand une nouvelle version de `module.json` est poussée sur `main`, si le tag correspondant n'existe pas encore.
