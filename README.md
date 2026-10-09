# Stable Diffusion Character Viewer

Next.js app to browse Stable Diffusion character PNGs (and optionally short video clips) using
predefined filters.

## Image Folder Structure

The app expects this tree inside your configured root directory:

```text
characters/{style}/{character_name}/*.png
characters/{style}/{character_name}/*.mp4
```

Styles configuration:

- Optional styles are loaded from `config.json` in the image root folder (`SD_IMAGES_ROOT`).
- `config.json` accepts `styles` (array of folder names), optional `defaultStyle`, optional `styleLabels` for display aliases, and optional `animations` (see [Upscale and Animate Marking](#upscale-and-animate-marking) below).
- If `config.json` is missing or invalid, the app falls back to `realistic`, `3d` (default), and `anime`, with no configured animations.

Example `config.json`:

```json
{
  "styles": ["comic", "3d", "anime"],
  "defaultStyle": "comic",
  "styleLabels": {
    "comic": "Comic Book",
    "3d": "3D Render"
  },
  "animations": [
    { "key": "zoom-in", "name": "Zoom In", "prompt": "slow zoom in on the face" },
    {
      "key": "pan",
      "name": "Pan Left to Right",
      "prompt": ["slow pan left to right", "fast pan left to right"],
      "lora": "camera_pan",
      "trigger": "panshot",
      "weight": 0.8
    },
    {
      "key": "dance",
      "name": "Dance",
      "subVersions": [
        { "key": "latin-dance", "name": "Latin Dance", "prompt": "latin dancing" },
        { "key": "sensual-dance", "name": "Sensual Dance", "prompt": "slow sensual dancing" }
      ]
    }
  ]
}
```

Each `animations` entry is an object with:

- `key` (required, unique across the whole tree) and `name` (required, display name).
- `prompt`: a string, or an array of strings. When an image is marked, one line of the array is picked at random.
- `lora`, `trigger` (strings) and `weight` (number): optional, copied as-is into the mark entry for the external tool.
- `subVersions`: optional nested entries of the same shape.

An entry with an empty (or missing) `prompt` and no `subVersions` is skipped entirely. An entry with an empty `prompt` but with `subVersions` stays selectable: marking with it picks one of its sub-versions at random (recursively), and that sub-version's key, prompt and `lora`/`trigger`/`weight` are what get stored. Plain-string entries (the old `"animations": ["Zoom In"]` format) have no prompt and are therefore skipped.

Pose naming rules:

- One file equals one pose image or video (for example `Base.png`, `Lying Side.png`, `Dance.mp4`).
- Variant files are supported with numeric suffixes (for example `Full.png`, `Full 2.png`, `Dance 2.mp4`).
- `Base` is treated as the thumbnail pose for each character.
- Anything in square brackets is an annotation, not part of the pose, and is ignored by the pose filters (for example `Casual [Upscaled].png` or `Casual 2 [Extended].mp4` both count as the `Casual` pose).
- A video can be named `Animation (Pose).mp4`: the part before the parentheses is the animation, the part inside is the pose. Only the pose part is used by the pose filters, so `Dancing (Casual).mp4` is listed under `Casual`. A video without parentheses (for example `Dancing.mp4`) uses its whole name as its pose.
- The Duplicate Finder still groups by the full name (minus the variant number), so `Dancing (Casual).mp4` and `Casual.mp4` are never treated as duplicates of each other.

### Video Support

`.mp4` files are indexed alongside `.png` images using the exact same folder/naming convention, and
appear in the character/style/pose views and filters. A switch next to the style selector lets you
show Images, Videos, or Both. Video differs from images in a few deliberate ways:

- No auto-play, anywhere in the app; playback always starts paused.
- The detail view's magnifier/zoom is image-only; video gets standard playback controls instead.
- No metadata panel (the SD "parameters" PNG chunk convention has no video equivalent).
- No Upscale/Animate marking — only **Redraw** and **Delete** are available.
- Excluded entirely from the Duplicate Finder.
- Grid thumbnails: if a matching `<name>.preview.png` sidecar exists next to the video (for example
  `Dance.mp4` → `Dance.preview.png`), it's shown as a static poster image. It can be provided
  manually, or generated with the [preview sync script](#preview-thumbnails) (requires `ffmpeg`).
  Without one, the grid falls back to a muted, controls-less `<video>` element as the thumbnail.

Character metadata file:

- Optional metadata is loaded from `characters/characters.json`.
- Each character metadata entry supports `name`, `category`, optional `serie`, and optional `tags` (array of strings).
- `tags` are exposed as additional metadata filters in the UI, alongside category and serie.

### Extra image folders:

- Additional images can be loaded from folders configured with `SD_EXTRA_IMAGES_ROOT` (a list of paths separated by `:` on Linux/macOS or `;` on Windows).
- Each configured entry is either an images root itself (it directly contains a `characters` folder) or a parent directory whose immediate subdirectories are each their own images root. The latter is what makes multiple extra folders work in Docker, where a single bind mount can only map one host path: point `SD_EXTRA_IMAGES_ROOT` at a parent directory and put each additional folder inside it as a subdirectory.
- Extra roots only ever contribute images. `config.json`, `characters/characters.json`, `pose-filters.json`, `duplicate-reviews.json`, `to-upscale.json`, and `to-animate.json` are always read from (and written to) the main root (`SD_IMAGES_ROOT`) only — an extra root's own copies of these files, if any, are ignored. Likewise, only the main root's `config.json` determines the list of available styles; a style folder in an extra root that isn't part of that list is skipped.
- Images found in an extra root are merged into the same browsable library as the main root (characters, poses, thumbnails, the "new" badge, and the Duplicate Finder), and support the same view/rename/delete actions. Duplicate detection only ever groups images that live in the same root, since validating a group renumbers files within a single folder.

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

## Random Pick

The dice button in the top app bar picks something at random from what the current view shows:

- On the base **Characters** page (no character selected), it opens a random character among the visible ones (respecting the media type and metadata filters).
- Anywhere else (a character's page, the Styles view, the Poses view), it opens a random image or video from the currently filtered grid in the detail view, so previous/next navigation keeps working within that list. Since the grid already respects the Images/Videos/Both switch, a selection of only pictures yields a picture, only videos a video.

## New Images

Media discovered in the last 3 days is flagged as new (star badge, and the side menu's **Show new only** filter). Opening an item in the detail view doesn't change that; a new item's detail view shows a **Mark as seen** button that clears the flag right away, for any authenticated viewer (it doesn't require `SD_ALLOW_DELETE`).

## Sort by Date

The side menu's **Sort by** switch orders characters and images by name (default) or by date, newest first. In Date mode, each card also shows its date under the title: the date an image was first discovered, or for a character card, its earliest discovered image in the default style. Images explicitly marked as seen are no longer flagged as new and lose their discovery date (they sort last and show no date).

## Preview Thumbnails

To keep the browsing grid fast, the app serves a heavily compressed preview next to each media file instead of transferring the full-resolution file: a JPEG for images (`.preview.jpg`), or a PNG poster frame for videos (`.preview.png`). A preview is stored as a sibling file, for example `characters/3d/Elric/Base.png` gets `characters/3d/Elric/Base.preview.jpg`, and `characters/3d/Elric/Dance.mp4` gets `characters/3d/Elric/Dance.preview.png`.

Generate (or refresh) previews with:

```bash
pnpm sync:first-seen:creation-dates
```

This script walks every PNG and MP4 under `characters/` in `SD_IMAGES_ROOT` and in any [extra image folders](#extra-image-folders) configured via `SD_EXTRA_IMAGES_ROOT`, and for each one it skips files whose preview is already newer than the source file. Video previews require `ffmpeg` to be installed and available on `PATH` — the script extracts the first frame of the clip. Options:

- `--dry-run`: report how many previews would be generated without writing anything.
- `--skip-thumbnails`: only sync the first-seen cache, skip preview generation.
- `SD_PREVIEW_MAX_DIMENSION` (default `640`): longest edge, in pixels, of generated previews (images and videos).
- `SD_PREVIEW_JPEG_QUALITY` (default `70`): JPEG quality (1-100) used for image previews only.

`GET /api/image?path=...&variant=preview` serves the compressed preview when one exists. For images it transparently falls back to the full PNG otherwise, so the app keeps working before previews are generated. For videos there is no such fallback: a `variant=preview` request 404s rather than streaming the raw video file, whether the missing `.preview.png` was meant to be generated by this script or provided manually. The full-resolution modal view always requests the original file.

### HTTP Caching

`GET /api/image` responses (both variants) carry `Cache-Control: public, max-age=86400, must-revalidate`, an `ETag`, and a `Last-Modified` header derived from the served file's size and modification time. Browsers revalidate with `If-None-Match`/`If-Modified-Since` and get a bodyless `304` when the file hasn't changed, so repeat views (scrolling back, reopening a character) cost a small header round trip instead of a full re-download. The cache key is tied to file `mtime`/size rather than the first-seen timestamp, because `firstSeenAt` never changes when a file is overwritten in place under the same name (e.g. regenerating a pose), which would make a stale image cache forever.

## Library Toolbox

When `SD_ALLOW_DELETE` is enabled, the side menu's **Tools** section shows a **Library Toolbox** button. It opens a popup listing the library-maintenance tools; picking one closes the toolbox and opens that tool.

- **Duplicate Finder**: groups images sharing the same style, character, and pose (in the same folder) so you can keep the ones you want; validating deletes the others and renumbers the survivors.

## Manual Rename

When `SD_ALLOW_DELETE` is enabled, the detail view shows a pencil icon next to the pose name. It opens a dialog to rename the file: you edit the name without its extension (`.png`/`.mp4` is kept), and the file stays in the same folder.

- If another file in that folder already uses the name (compared case-insensitively), the rename is refused and the dialog shows an error; nothing is changed on disk.
- Names can't be empty, start or end with `.`, contain `/ \ < > : " | ? *`, or end in a preview-sidecar suffix (`.preview`).
- Unlike **Redraw**, a rename is the same media under a new name, so everything attached to it follows: its preview thumbnail, its discovery date and "new"/seen state, its pending Upscale/Animate/Extend marks, and its video links (both a video's own link and links from videos generated from it).
- `PATCH /api/image?path=...` with a JSON body `{ "newName": "..." }` performs the rename (`409` on a name conflict, `400` on an invalid name); without a body it keeps the Redraw behavior.

## Upscale and Animate Marking

The image detail view has **Upscale** and **Animate** buttons (alongside Redraw/Delete) to flag an image for later, external processing — the app itself never upscales or animates anything, it just records the request. Both buttons are hidden for videos (see [Video Support](#video-support)); `GET`/`PUT`/`DELETE /api/marks` also reject a video path with `400`.

- Both buttons are shown only when `SD_ALLOW_DELETE` is enabled, the same flag that gates Redraw/Delete.
- **Upscale** is a plain toggle: click to mark, click again to unmark.
- **Animate** opens a dropdown of the animation names configured in `config.json`'s `animations` array (see [Image Folder Structure](#image-folder-structure) above); the button itself is hidden when that list is empty. Picking a name marks the image with that action; picking the currently-marked name again unmarks it. Picking a different name switches the mark to the new action.
- Marks are stored as flat JSON objects, one entry per marked image, keyed by the image's relative path (the same relative path used by `GET /api/image?path=...`):
  - `to-upscale.json` — value is the image's raw PNG generation metadata (the `parameters` text chunk) as a string.
  - `to-animate.json` — value is `{ "metadata": "...", "action": "zoom-in", "prompt": "...", "lora": "...", "trigger": "...", "weight": 0.8 }` (`action` is the key of the node actually picked; `lora`/`trigger`/`weight` only when that node sets them).
- Both files live in the main root (`SD_IMAGES_ROOT`) and are created automatically the first time an image is marked.
- Deleting or redrawing (renaming) an image removes its entry from both files automatically, so they never reference a path that no longer exists.

Example `to-animate.json`:

```json
{
  "characters/3d/Anna/Base.png": {
    "metadata": "Steps: 30, Sampler: DPM++ 2M, ...",
    "action": "pan",
    "prompt": "slow pan left to right",
    "lora": "camera_pan",
    "trigger": "panshot",
    "weight": 0.8
  }
}
```

## Environment Variables

| Variable                   | Required                       | Default                                                          | Description                                                                                                                                                                                                                                                                                                                           |
| -------------------------- | ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SD_IMAGES_ROOT`           | Yes                            | —                                                                | Host directory that contains the `characters` folder.                                                                                                                                                                                                                                                                                 |
| `SD_EXTRA_IMAGES_ROOT`     | No                             | —                                                                | Additional images root(s), merged into the same library as `SD_IMAGES_ROOT`. See [Extra image folders](#image-folder-structure) above. Accepts multiple paths separated by `:` (`;` on Windows).                                                                                                                                      |
| `SD_CACHE_DIR`             | No                             | `.cache/sd-character-viewer` (relative to the working directory) | Writable directory used to persist the discovery cache that powers the `new` image filter.                                                                                                                                                                                                                                            |
| `SD_PASSWORD`              | No                             | —                                                                | Enables password-protected access when set. Leave unset to run without a login screen.                                                                                                                                                                                                                                                |
| `SD_PASSWORD_SALT`         | Only when `SD_PASSWORD` is set | —                                                                | Salt used to hash the configured password. The app reports a configuration error at startup if `SD_PASSWORD` is set without this.                                                                                                                                                                                                     |
| `SD_ALLOW_DELETE`          | No                             | `false`                                                          | Enables destructive image actions: deleting an image, "Redraw" (renumbers a regenerated pose), manual rename, the Library Toolbox (and the Duplicate Finder's "Validate" action (deletes unselected duplicates and renumbers the ones kept)), and the Upscale/Animate marking buttons. Accepts `true`, `1`, or `yes` (case-insensitive); anything else is treated as disabled. |
| `SD_PREVIEW_MAX_DIMENSION` | No                             | `640`                                                            | Longest edge, in pixels, of generated preview thumbnails. Used by the [preview sync script](#preview-thumbnails).                                                                                                                                                                                                                     |
| `SD_PREVIEW_JPEG_QUALITY`  | No                             | `70`                                                             | JPEG quality (1-100) used for image preview thumbnails. Used by the [preview sync script](#preview-thumbnails).                                                                                                                                                                                                                       |

Priority order used by the app:

1. Runtime environment variable (`process.env`) - recommended for Docker and production.
2. Local env files loaded automatically (`.env.local`, `.env`) - useful for local development.

Example:

```bash
export SD_IMAGES_ROOT=/data/stable-diffusion
export SD_EXTRA_IMAGES_ROOT=/mnt/drive2/stable-diffusion:/mnt/drive3/stable-diffusion
export SD_CACHE_DIR=/var/lib/sd-character-viewer/cache
export SD_PASSWORD=your-password
export SD_PASSWORD_SALT=some-random-string
export SD_ALLOW_DELETE=true
```

Local development example in `.env.local`:

```bash
SD_IMAGES_ROOT=/absolute/path/to/your/images/root
SD_EXTRA_IMAGES_ROOT=/absolute/path/to/your/extra/images/root
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
	-e SD_EXTRA_IMAGES_ROOT=/data-extra \
	-e SD_CACHE_DIR=/cache \
	-e SD_PASSWORD=your-password \
	-e SD_PASSWORD_SALT=some-random-string \
	-e SD_ALLOW_DELETE=true \
	-v /absolute/path/to/your/images/root:/data:ro \
	-v /absolute/path/to/your/extra/images:/data-extra:ro \
	-v /absolute/path/to/your/cache/dir:/cache:rw \
	sd-character-viewer
```

`SD_PASSWORD_SALT` is required whenever `SD_PASSWORD` is set; `SD_ALLOW_DELETE` is optional and can be dropped to keep destructive image actions disabled. `SD_EXTRA_IMAGES_ROOT`/the extra volume are optional too; drop both if you only have one images folder.

Run with Docker Compose:

1. Set compose variables in your shell or a local `.env` file:

```bash
SD_IMAGES_HOST_PATH=/absolute/path/to/your/images/root
SD_EXTRA_IMAGES_ROOT=/absolute/path/to/your/extra/images
SD_CACHE_HOST_PATH=/absolute/path/to/your/cache/dir
SD_PASSWORD=your-password
SD_PASSWORD_SALT=some-random-string
SD_ALLOW_DELETE=true
```

`SD_EXTRA_IMAGES_ROOT` is optional. Since Compose can only bind-mount one host path there, point it either directly at an extra images root (a folder containing `characters/`), or at a parent directory containing several such folders as immediate subdirectories — each one is then loaded as its own extra images root.

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
- `GET /api/image?path=characters/...`: Streams a PNG or MP4 file safely from configured root (`Content-Type` is derived from the file's extension). Add `&variant=preview` to stream the compressed preview instead — falls back to the original PNG if no `.preview.jpg` exists yet, but returns `404` for a video with no `.preview.png` sidecar (see [Video Support](#video-support)) rather than streaming the raw video.
- `GET /api/marks?path=characters/...`: Returns `{ upscale: boolean, animate: { action: string } | null }`, the current upscale/animate mark state for an image. See [Upscale and Animate Marking](#upscale-and-animate-marking). Returns `400` for a video path.
- `PUT /api/marks`: Marks an image. Body: `{ path, type: "upscale", metadata }` or `{ path, type: "animate", action, metadata }`. Requires `SD_ALLOW_DELETE`. Returns `400` for a video path.
- `DELETE /api/marks?path=characters/...&type=upscale|animate`: Removes a mark. Requires `SD_ALLOW_DELETE`. Returns `400` for a video path.

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
