# Stable Diffusion Character Viewer

Next.js app to browse Stable Diffusion character PNGs using predefined filters.

## Image Folder Structure

The app expects this tree inside your configured root directory:

```text
characters/{style}/{character_name}/*.png
```

Supported styles:

- `3d` (default)
- `realistic`
- `anime`

Pose naming rules:

- One file equals one pose image (for example `Base.png`, `Lying Side On Bed.png`).
- Variant files are supported with numeric suffixes (for example `Full.png`, `Full2.png`).
- `Base` is treated as the thumbnail pose for each character.

Optional pose pattern filters:

- Add `pose-filters.json` in the image root folder (`SD_IMAGES_ROOT`).
- Each item defines a synthetic filter chip with a `label`, a regex `pattern`, and optional regex `flags`.
- A synthetic filter is shown only when at least one pose name matches its pattern.

Example `pose-filters.json`:

```json
[
	{ "label": "With Somebody", "pattern": "^With " },
	{ "label": "With Somebody (CI)", "pattern": "^with ", "flags": "i" }
]
```

## Environment Variable

Set `SD_IMAGES_ROOT` to the host directory that contains the `characters` folder.

Set `SD_CACHE_DIR` to a writable directory used to persist discovery cache files (for the `new` image filter). If not set, the app defaults to `.cache/sd-character-viewer` under the working directory.

Priority order used by the app:

1. Runtime environment variable (`process.env`) - recommended for Docker and production.
2. Local env files loaded automatically (`.env.local`, `.env`) - useful for local development.

Example:

```bash
export SD_IMAGES_ROOT=/data/stable-diffusion
export SD_CACHE_DIR=/var/lib/sd-character-viewer/cache
```

Local development example in `.env.local`:

```bash
SD_IMAGES_ROOT=/absolute/path/to/your/images/root
SD_CACHE_DIR=/absolute/path/to/your/cache/dir
```

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Run With Docker

Build and run directly with Docker:

```bash
docker build -t sd-character-viewer .
docker run --rm -p 3000:3000 \
	-e SD_IMAGES_ROOT=/data \
	-e SD_CACHE_DIR=/cache \
	-e SD_PASSWORD=your-password \
	-v /absolute/path/to/your/images/root:/data:ro \
	-v /absolute/path/to/your/cache/dir:/cache:rw \
	sd-character-viewer
```

Run with Docker Compose:

1. Set compose variables in your shell or a local `.env` file:

```bash
SD_IMAGES_HOST_PATH=/absolute/path/to/your/images/root
SD_CACHE_HOST_PATH=/absolute/path/to/your/cache/dir
SD_PASSWORD=your-password
```

2. Start the app:

```bash
docker compose up --build
```

3. Open `http://localhost:3000`.

## Filter Flow

The left menu controls the major filter:

- Filter by Character
- Filter by Style
- Filter by Pose

Then a horizontal filter bar updates based on the selected major filter.

Example character flow:

1. Open app.
2. Select `Filter by Character`.
3. Browse all characters for the selected style (`3d` by default).
4. Select a character to view all poses and styles for that character.
5. Use top chips to quickly narrow by style or pose.

## API Endpoints

- `GET /api/library`: Returns computed library index from disk.
- `GET /api/image?path=characters/...`: Streams a PNG image safely from configured root.

## Test And Lint

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm knip
pnpm test
```

## Pre-commit Hook

This project uses Husky pre-commit hooks. After `pnpm install`, Git commits run:

```bash
pnpm precommit:check
```

The hook blocks the commit if any check fails (format check, eslint with zero warnings, typecheck, tests, knip).

## Pre-push Hook

This project uses a Husky pre-push hook to validate production build integrity before pushing:

```bash
pnpm prepush:check
```

The push is blocked if the build fails.
