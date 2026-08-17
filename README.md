# Stable Diffusion Character Viewer

Next.js app to browse Stable Diffusion character PNGs using predefined filters.

## Image Folder Structure

The app expects this tree inside your configured root directory:

```text
characters/{style}/{character_name}/*.png
```

Styles configuration:

- Optional styles are loaded from `config.json` in the image root folder (`SD_IMAGES_ROOT`).
- `config.json` accepts `styles` (array of folder names), optional `defaultStyle`, and optional `styleLabels` for display aliases.
- If `config.json` is missing or invalid, the app falls back to `realistic`, `3d` (default), and `anime`.

Example `config.json`:

```json
{
  "styles": ["comic", "3d", "anime"],
  "defaultStyle": "comic",
  "styleLabels": {
    "comic": "Comic Book",
    "3d": "3D Render"
  }
}
```

Pose naming rules:

- One file equals one pose image (for example `Base.png`, `Lying Side.png`).
- Variant files are supported with numeric suffixes (for example `Full.png`, `Full 2.png`).
- `Base` is treated as the thumbnail pose for each character.

Character metadata file:

- Optional metadata is loaded from `characters/characters.json`.
- Each character metadata entry supports `name`, `category`, optional `serie`, and optional `tags` (array of strings).
- `tags` are exposed as additional metadata filters in the UI, alongside category and serie.

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

## Preview Thumbnails

To keep the browsing grid fast, the app serves a heavily compressed JPEG preview next to each PNG instead of transferring the full-resolution file. A preview is stored as a sibling file using the `.preview.jpg` suffix, for example `characters/3d/Elric/Base.png` gets `characters/3d/Elric/Base.preview.jpg`.

Generate (or refresh) previews with:

```bash
pnpm sync:first-seen:creation-dates
```

This script walks every PNG under `characters/`, and for each one it skips images whose preview is already newer than the source PNG. Options:

- `--dry-run`: report how many previews would be generated without writing anything.
- `--skip-thumbnails`: only sync the first-seen cache, skip preview generation.
- `SD_PREVIEW_MAX_DIMENSION` (default `640`): longest edge, in pixels, of generated previews.
- `SD_PREVIEW_JPEG_QUALITY` (default `70`): JPEG quality (1-100) used for previews.

`GET /api/image?path=...&variant=preview` serves the JPEG preview when one exists and transparently falls back to the full PNG otherwise, so the app keeps working before previews are generated. The full-resolution modal view always requests the original PNG.

### HTTP Caching

`GET /api/image` responses (both variants) carry `Cache-Control: public, max-age=86400, must-revalidate`, an `ETag`, and a `Last-Modified` header derived from the served file's size and modification time. Browsers revalidate with `If-None-Match`/`If-Modified-Since` and get a bodyless `304` when the file hasn't changed, so repeat views (scrolling back, reopening a character) cost a small header round trip instead of a full re-download. The cache key is tied to file `mtime`/size rather than the first-seen timestamp, because `firstSeenAt` never changes when a file is overwritten in place under the same name (e.g. regenerating a pose), which would make a stale image cache forever.

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SD_IMAGES_ROOT` | Yes | — | Host directory that contains the `characters` folder. |
| `SD_CACHE_DIR` | No | `.cache/sd-character-viewer` (relative to the working directory) | Writable directory used to persist the discovery cache that powers the `new` image filter. |
| `SD_PASSWORD` | No | — | Enables password-protected access when set. Leave unset to run without a login screen. |
| `SD_PASSWORD_SALT` | Only when `SD_PASSWORD` is set | — | Salt used to hash the configured password. The app reports a configuration error at startup if `SD_PASSWORD` is set without this. |
| `SD_ALLOW_DELETE` | No | `false` | Enables destructive image actions: deleting an image, "Redraw" (renumbers a regenerated pose), and the Duplicate Finder's "Validate" action (deletes unselected duplicates and renumbers the ones kept). Accepts `true`, `1`, or `yes` (case-insensitive); anything else is treated as disabled. |
| `SD_PREVIEW_MAX_DIMENSION` | No | `640` | Longest edge, in pixels, of generated preview thumbnails. Used by the [preview sync script](#preview-thumbnails). |
| `SD_PREVIEW_JPEG_QUALITY` | No | `70` | JPEG quality (1-100) used for preview thumbnails. Used by the [preview sync script](#preview-thumbnails). |

Priority order used by the app:

1. Runtime environment variable (`process.env`) - recommended for Docker and production.
2. Local env files loaded automatically (`.env.local`, `.env`) - useful for local development.

Example:

```bash
export SD_IMAGES_ROOT=/data/stable-diffusion
export SD_CACHE_DIR=/var/lib/sd-character-viewer/cache
export SD_PASSWORD=your-password
export SD_PASSWORD_SALT=some-random-string
export SD_ALLOW_DELETE=true
```

Local development example in `.env.local`:

```bash
SD_IMAGES_ROOT=/absolute/path/to/your/images/root
SD_CACHE_DIR=/absolute/path/to/your/cache/dir
SD_PASSWORD=your-password
SD_PASSWORD_SALT=some-random-string
SD_ALLOW_DELETE=true
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
	-e SD_PASSWORD_SALT=some-random-string \
	-e SD_ALLOW_DELETE=true \
	-v /absolute/path/to/your/images/root:/data:ro \
	-v /absolute/path/to/your/cache/dir:/cache:rw \
	sd-character-viewer
```

`SD_PASSWORD_SALT` is required whenever `SD_PASSWORD` is set; `SD_ALLOW_DELETE` is optional and can be dropped to keep destructive image actions disabled.

Run with Docker Compose:

1. Set compose variables in your shell or a local `.env` file:

```bash
SD_IMAGES_HOST_PATH=/absolute/path/to/your/images/root
SD_CACHE_HOST_PATH=/absolute/path/to/your/cache/dir
SD_PASSWORD=your-password
SD_PASSWORD_SALT=some-random-string
SD_ALLOW_DELETE=true
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
- `GET /api/image?path=characters/...`: Streams a PNG image safely from configured root. Add `&variant=preview` to stream the compressed JPEG preview instead (falls back to the PNG if no preview exists yet).

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
