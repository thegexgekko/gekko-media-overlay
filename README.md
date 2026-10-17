# GEKKO — Media Overlay

Module Foundry VTT V14 permettant au MJ d'afficher des images, vidéos, textes et contenus HTML simples dans plusieurs fenêtres indépendantes au-dessus de la scène.

## Fonctions principales

- Plusieurs fenêtres simultanées.
- Les panneaux de réglage de chaque fenêtre peuvent être repliés pour faciliter la gestion de nombreuses fenêtres média.
- Bouton Réglages réservé au MJ directement sur les fenêtres affichées, ouvrant le gestionnaire sur la fenêtre concernée.
- Contenus : image, vidéo, texte ou HTML simple filtré.
- Ciblage de tous les joueurs ou de joueurs sélectionnés.
- Quatre modes de placement : fixe, flottant contrôlé par le MJ, flottant contrôlé par chaque joueur, ou attaché à un token.
- Déplacement direct à la souris.
- Bouton GEKKO dans le HUD des tokens pour créer rapidement une fenêtre liée.
- Fenêtres liées : 8 positions autour du token, distance réglable et suivi automatique pendant déplacements, panoramique et zoom.
- Les fenêtres attachées à un token restent contrôlables uniquement par le MJ ; les joueurs les voient sans pouvoir les déplacer, les redimensionner ou les fermer.
- Redimensionnement direct par une poignée placée en bas à droite des fenêtres flottantes.
- Ratio des images et vidéos toujours conservé lors du redimensionnement.
- Taille et position synchronisées en direct en mode MJ.
- Taille et position indépendantes et mémorisées localement en mode joueur.
- Opacité du contenu et opacité du fond de fenêtre réglables séparément.
- Bouton de fermeture local côté joueur, activable fenêtre par fenêtre par le MJ.
- Cadres intégrés : Aucun, Sobre, Métal, Holographique, Terminal et Fantasy.
- Cadres personnalisés chargés depuis le dossier Data de Foundry.
- Épaisseur et écart avec le média réglables indépendamment pour les cadres personnalisés ; l'écart repousse le cadre vers l'extérieur sans réduire le média et sans modifier l'opacité du fond.
- Aperçu MJ.
- Bouton dédié dans la barre de contrôles de scène.

## Installation par manifeste

Dans Foundry VTT, utiliser :

`https://raw.githubusercontent.com/thegexgekko/gekko-media-overlay/main/module.json`

Foundry peut ensuite détecter les nouvelles versions publiées sur GitHub.

## Cadres personnalisés

Pour éviter qu'une mise à jour du module supprime les fichiers personnels, les cadres personnalisés sont chargés depuis :

`Data/gekko-media-overlay/frames/`

### Ajout simple — recommandé

Déposer directement une image PNG, WebP, SVG, JPG ou GIF dans le dossier `frames`. Aucun fichier JSON n'est nécessaire.

```text
Data/
└── gekko-media-overlay/
    └── frames/
        ├── holo-bleu.png
        ├── cadre-metal.webp
        └── nova-frame.svg
```

Le nom affiché est dérivé automatiquement du nom du fichier. Le gestionnaire permet de régler séparément l’épaisseur du cadre et l’écart entre le cadre et le média. Cet écart déplace le cadre vers l’extérieur : il ne réduit donc pas la taille du média. L’opacité du fond de fenêtre reste entièrement indépendante. En mode simple, le module applique automatiquement un découpage 9-slice : les quatre coins restent intacts et seuls les bords s'étirent pour s'adapter au ratio du média.

### Ajout avancé — optionnel

Pour régler précisément le 9-slice, l'épaisseur, le padding, le rayon ou la répétition, créer un sous-dossier contenant une image et un `frame.json` :

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

Après avoir ajouté ou modifié un cadre, ouvrir le gestionnaire et cliquer sur **Cadres perso** pour recharger la liste. La notification indique maintenant combien de cadres personnalisés ont réellement été détectés.

## HTML simple

Le mode HTML autorise volontairement un sous-ensemble limité : titres, paragraphes, gras, italique, listes, liens, images, tableaux simples, code et citations. Les scripts, gestionnaires d'événements JavaScript, styles inline, classes et identifiants sont supprimés avant affichage.

## Correctifs

- **0.4.4** : uniformisation de la barre de contrôle des médias ; Déplacer, Recentrer et Réglages sont désormais des boutons compacts à icône seule.
- **0.4.3** : ajout d'un bouton Réglages réservé au MJ directement sur les fenêtres affichées ; il ouvre le gestionnaire sur la fenêtre concernée et la déplie automatiquement.
- **0.4.2** : ajout de panneaux repliables dans le gestionnaire afin de naviguer plus facilement entre plusieurs fenêtres média.
- **0.4.1** : correction du calcul de position des fenêtres attachées à un token ; le pan et le zoom n'étaient plus appliqués deux fois, ce qui pouvait envoyer la fenêtre hors écran.

## Publication

Le workflow GitHub Actions `.github/workflows/release.yml` crée automatiquement une release quand une nouvelle version de `module.json` est poussée sur `main`, si le tag correspondant n'existe pas encore.

Version actuelle : **0.4.4**.
