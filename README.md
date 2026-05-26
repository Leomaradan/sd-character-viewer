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

## Environment Variable

Set `SD_IMAGES_ROOT` to the host directory that contains the `characters` folder.

Example:

```bash
export SD_IMAGES_ROOT=/data/stable-diffusion
```

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

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
npm run lint
npm run test
npm run test:coverage
```
