# Nearbound Open Space

Open-space 2D façon vieux RPG 16x16, avec présence spatiale, voix, caméra et partage d'écran via LiveKit.

## Fonctionnalités

- Login navigateur avec nom, salle et couleur de sprite.
- Carte pixel 2D avec sols/murs 16x16, meubles extraits et renommés depuis `assets/textures`.
- Déplacement clavier `WASD`/flèches ou clic dans la carte.
- Collisions sur murs, bureaux, meubles et salles.
- Présence temps réel par LiveKit data packets.
- Proximité audio/vidéo: les tracks LiveKit ne sont souscrites que si l'autre avatar est proche.
- Salles privées: si quelqu'un est dans une salle privée, seuls les avatars dans la même salle sont audibles.
- Contrôles micro, caméra, partage d'écran et sortie.
- Dockerfile prêt pour Dokploy.

## Architecture

- `server/index.mjs`: serveur Express, healthcheck, config publique, endpoint de token LiveKit.
- `src/game`: carte, atlas, collisions, rendu canvas.
- `src/livekit/useLiveKitRoom.ts`: connexion LiveKit, data channel de position, souscription aux pistes par proximité.
- `tools/extract_office_assets.py`: découpe une sélection nommée depuis les spritesheets sources.
- `public/assets/office`: assets prêts à servir par le frontend.

## Variables d'environnement

Copier `.env.example` vers `.env` en local ou déclarer ces variables dans Dokploy:

```bash
PORT=3000
PUBLIC_APP_NAME="Nearbound Open Space"
DEFAULT_ROOM=nearbound-open-space
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_KEY=replace-me
LIVEKIT_API_SECRET=replace-me
```

Sans variables LiveKit, l'app s'ouvre en aperçu local: la carte fonctionne, mais voix/caméra/écran restent désactivés.

## Développement local

Prérequis: Node.js 22+.

Si `where node` montre `C:\Program Files\Volta\node.exe` avant `C:\Program Files\nodejs\node.exe`, Volta choisit la version. Le projet pin Node 24.12.0 dans `package.json`; au besoin:

```bash
volta install node@24.12.0 npm@11.6.2
```

```bash
node -v
npm install
npm run dev
```

Ouvrir `http://localhost:3000`.

Vérifications:

```bash
npm run typecheck
npm run build
```

## Déploiement Dokploy

1. Pousser ce dossier sur GitHub.
2. Dans Dokploy, créer une app depuis le repo GitHub.
3. Choisir le déploiement Dockerfile.
4. Définir les variables d'environnement LiveKit ci-dessus.
5. Exposer le port interne `3000`.
6. Déployer.

Le conteneur lance `node server/index.mjs` avec `NODE_ENV=production`, sert `dist` et signe les tokens LiveKit côté serveur.

## Assets

Les spritesheets d'origine restent dans `assets/textures`. La sélection propre est générée dans `public/assets/office`:

```bash
python tools/extract_office_assets.py
```

Le script nomme et documente les découpes dans `public/assets/office/manifest.json`. Il faut `Pillow` pour régénérer les PNG.

## Notes produit

Le comportement cible reprend les éléments clés des bureaux virtuels type Gather: présence spatiale, conversations proches, salles privées, bureaux/aires d'équipe et objets interactifs. WorkAdventure confirme aussi le bon modèle d'un monde 2D où les conversations naissent naturellement en approchant les avatars.

Le contrôle de proximité est appliqué côté client par souscription/désouscription LiveKit et volume local. Pour une isolation forte contre un client modifié, il faudra ajouter une logique serveur qui sépare dynamiquement les participants en rooms LiveKit ou applique des grants plus stricts.
