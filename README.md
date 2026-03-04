# High Ground Studio (Monorepo)

This repo contains:
- `apps/web` — Next.js site (deploy this on Vercel; set Root Directory to `apps/web`)
- `apps/motion-lab` — local Three.js/Vite playground for motion development
- `packages/motion-engine` — shared engine code used by both apps
- `assets/renders` — local render outputs (copy into `apps/web/public/renders` as needed)
- `scripts` — helper scripts (sync + placeholder render pipeline)

## Quick start (web)
```bash
cd apps/web
npm install
npm run dev
```

## Quick start (motion lab)
```bash
cd apps/motion-lab
npm install
npm run dev
```

## Copy rendered assets into the website
Place assets under:
`apps/web/public/renders/episode-###/`

Example:
`apps/web/public/renders/episode-001/intro-web.mp4`

Then the website will automatically list them on the homepage.
