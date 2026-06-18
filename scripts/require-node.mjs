const [major] = process.versions.node.split(".").map(Number);

if (major < 22) {
  console.error(`
Node.js ${process.versions.node} détecté.

Ce projet cible Node.js 22+ parce que Vite, Express 5 et le SDK LiveKit serveur utilisent des APIs Node récentes.

Corrige ton environnement puis relance:

  node -v
  npm run dev

Options Windows:
  - installer Node.js 22 LTS depuis https://nodejs.org/
  - ou utiliser nvm-windows: nvm install 22 && nvm use 22
`);
  process.exit(1);
}
