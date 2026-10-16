# GEKKO — Media Overlay

Module Foundry VTT V14 permettant au MJ d'afficher des images et des vidéos dans plusieurs fenêtres indépendantes au-dessus de la scène.

## Fonctions principales

- Plusieurs fenêtres média simultanées.
- Images et vidéos.
- Taille et position configurables.
- Sélection indépendante des joueurs destinataires pour chaque fenêtre.
- Aperçu MJ.
- Ouverture, mise à jour et fermeture indépendantes.
- Bouton dédié dans la barre de contrôles de scène.
- Icône GEKKO intégrée au style de l'interface Foundry.

## Installation par manifeste

Utiliser l'URL du manifeste :

`https://raw.githubusercontent.com/thegexgekko/gekko-media-overlay/main/module.json`

Une fois installé ainsi, Foundry VTT peut détecter les nouvelles versions publiées sur GitHub.

## Développement / publication

Le workflow GitHub Actions `.github/workflows/release.yml` crée automatiquement une release quand une nouvelle version de `module.json` est poussée sur `main`, si le tag correspondant n'existe pas encore.
