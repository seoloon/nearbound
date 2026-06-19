# Nearbound Open Space

A self-hosted 2D virtual office inspired by spatial workspaces such as Gather.
Nearbound runs in the browser, uses a pixel-art map, and relies on LiveKit for
voice, camera, and screen sharing.

The goal is simple: people move through a shared 2D office, hear and see each
other only when the map rules allow it, and can build the workspace directly
from the browser.

## Features

- Browser-based login with display name, room, profile status, bio, and avatar.
- Pixel-art 2D office rendered on canvas with 16x16 tiles.
- Hybrid movement: `WASD`, `ZQSD`, arrow keys, click-to-go, mouse-wheel zoom,
  and middle-click camera panning.
- Server-side sync for the shared map, presences, chat messages, office claims,
  and voice volume settings.
- LiveKit integration for microphone, camera, and screen sharing.
- Proximity media rules: remote tracks are subscribed to only when participants
  are audible or visible according to the map.
- Camera previews attached to player nametags and stream previews in the side
  panel.
- Map editor with Zone, Build, and Props tabs.
- Claimable offices, living areas, meetings with broadcast sub-zones, and
  player-managed hitbox zones.
- Dockerfile ready for Dokploy or any Docker-based host.

## How The Space Works

Nearbound separates world state from media transport.

- The Node/Express server is the source of truth for room state.
- Clients receive real-time updates through server-sent events.
- Clients post presence, map edits, chat messages, profile settings, and claims
  to the server.
- LiveKit is used for media tracks only: microphone, camera, and screen share.

This keeps map and presence synchronization under application control while
still using LiveKit for the hard real-time media layer.

## Zone Rules

The map editor supports four zone types:

- `Office`: claimable private area. The owner can work freely inside their own
  office.
- `Living Area`: everyone inside the same living area can hear, see camera, and
  view screen shares regardless of distance.
- `Meeting`: a main audience zone. People in the main zone cannot publish mic,
  camera, or screen.
- `Meeting Broadcast`: a required sub-zone for meetings. People standing in the
  broadcast zone can publish to everyone in the parent meeting.
- `Hitbox`: a blocking collision zone managed by users in the editor.

Build tiles do not create collision by default. Collision should be created
explicitly with Hitbox zones.

## Project Structure

```text
server/index.mjs              Express server, LiveKit token endpoint, sync API
src/App.tsx                   Main application shell
src/components                UI panels, controls, login, map editor, canvas
src/game                      Map model, renderer, editor types, asset registry
src/livekit                   LiveKit room connection and media rules
src/sync                      Server-side sync bridge
src/vendor/pixel-avatar-lib   Vendored avatar generator dependency
tools/extract_office_assets.py Texture extraction and registry generation
public/assets/office          Generated assets served by the frontend
assets                        Local source textures, ignored by Git
```

## Requirements

- Node.js 22 or newer
- npm
- Python 3 with Pillow, only when regenerating texture assets
- A deployed LiveKit server for voice, camera, and screen sharing

The project currently pins a Volta toolchain in `package.json`:

```bash
volta install node@24.12.0 npm@11.6.2
```

The app also works with plain Node.js 22+ if your local environment is already
using a compatible version.

## Environment Variables

Copy `.env.example` to `.env` for local development, or define the same values
in Dokploy.

```bash
PORT=3000
PUBLIC_APP_NAME="Nearbound Open Space"
DEFAULT_ROOM=nearbound-open-space
LIVEKIT_WS_URL=wss://livekit.example.com
LIVEKIT_API_KEY=replace-me
LIVEKIT_API_SECRET=replace-me
```

Optional:

```bash
NEARBOUND_DATA_DIR=.nearbound-data
```

`NEARBOUND_DATA_DIR` controls where the server persists room state. By default,
data is stored in `.nearbound-data/rooms`.

If the LiveKit variables are missing, the app still opens in local preview mode,
but microphone, camera, and screen sharing are disabled.

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run typecheck
npm run build
```

## Texture Assets

There are two asset locations, and the distinction matters.

```text
assets/                 Source textures, ignored by Git
public/assets/office/   Generated frontend assets, committed to Git
```

The source folder can contain large working files, sprite sheets, and unfinished
packs. Files starting with `PACK` and oversized/demo sheets are skipped by the
extractor.

To regenerate the frontend texture set:

```bash
python -m pip install Pillow
npm run extract:assets
```

This updates:

```text
public/assets/office/*.png
public/assets/office/manifest.json
src/game/assets.ts
```

Commit those generated files when texture changes should be deployed.

If a deployed server does not show the latest textures, make sure that:

- `npm run extract:assets` was run before committing.
- `public/assets/office` changes were committed and pushed.
- `src/game/assets.ts` was committed, because it contains the asset registry and
  cache-busting version.
- Dokploy rebuilt the Docker image instead of reusing an old build.

## Server Persistence

The server persists lightweight room data:

- map layout
- office claims
- voice volume settings
- recent chat messages

Presence is kept live and expires automatically.

For production Docker deployments, mount a persistent volume if you want rooms
to survive container recreation:

```text
/app/.nearbound-data
```

Or set `NEARBOUND_DATA_DIR` to another mounted path.

## Dokploy Deployment

1. Push the repository to GitHub.
2. Create a Dokploy app from the GitHub repository.
3. Select Dockerfile deployment.
4. Set the LiveKit environment variables.
5. Expose internal port `3000`.
6. Add a persistent volume for `/app/.nearbound-data` if room state should
   survive redeploys.
7. Deploy.

The production container:

- builds the Vite frontend into `dist`
- starts `node server/index.mjs`
- serves the frontend from Express
- signs LiveKit tokens server-side

## Docker Compose

For a local Docker smoke test:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

## Git Notes

The source texture folder is intentionally ignored:

```text
/assets/
```

The generated public texture folder is intentionally versioned:

```text
public/assets/office/
```

This keeps heavy or unfinished source packs out of Git while still making the
browser-ready assets deployable.

## Current Limitations

- The sync server is currently in-process. For multiple Node instances, room
  state should move to a shared store such as Redis or Postgres.
- LiveKit permissions are granted at room join. Fine-grained proximity rules are
  enforced by the app through subscription and publication behavior.
- A modified client could bypass some client-side behavior. Stronger isolation
  would require server-driven LiveKit room separation or stricter token grants.
