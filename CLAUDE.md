# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A Next.js (App Router) app for browsing Stable Diffusion character PNGs on disk, organized as
`characters/{style}/{character_name}/*.png`. It reads images from a filesystem root configured via
env vars (never a database), builds an in-memory "library index", and serves a MUI-based gallery UI
with character/style/pose filters, a duplicate finder, and optional password protection. See
[README.md](README.md) for the full user-facing behavior (folder structure, `config.json`,
`characters.json`, `pose-filters.json`, preview thumbnails, upscale/animate marking, env vars, API
endpoints) — it is kept accurate and detailed, so consult it first rather than re-deriving behavior
from code.

## Commands

```bash
pnpm dev                # start dev server (localhost:3000)
pnpm build               # production build (also runs as the pre-push check)
pnpm test                # vitest run with coverage
pnpm test:watch          # vitest watch mode
pnpm test:hook           # vitest run without coverage (used by pre-commit)
vitest run path/to/file.test.ts        # run a single test file
vitest run -t "test name substring"    # run tests matching a name
pnpm lint                # oxlint
pnpm lint:ci             # oxlint with --max-warnings=0 (used by pre-commit/CI)
pnpm format              # oxfmt write
pnpm format:check        # oxfmt check only
pnpm typecheck           # tsc --noEmit
pnpm knip                # unused files/exports/deps check
pnpm precommit:check     # format + lint:ci + typecheck + test:hook + knip (what Husky runs on commit)
pnpm sync:first-seen:creation-dates   # regenerate/refresh .preview.jpg thumbnails (see README)
```

Husky runs `pnpm precommit:check` on commit and `pnpm build` on push — expect any of those checks to
gate a change. Test files live next to the code they test as `*.test.ts(x)`, using Vitest +
Testing Library + jsdom (`environment: "node"` in `vitest.config.ts`, but component tests still use
jsdom via Testing Library setup).

Coverage thresholds (`vitest.config.ts`) are strict and enforced (statements/lines 96%, functions
98%, branches 88%) — new code in `src/lib` and non-`.tsx` files needs tests to match.

## Architecture

### Data flow: filesystem → library index → UI

Almost everything server-side funnels through **[src/lib/image-library.ts](src/lib/image-library.ts)**,
the core of the app. `readImageLibrary()`:

1. Resolves the main root from `SD_IMAGES_ROOT` and any extra roots from `SD_EXTRA_IMAGES_ROOT`
   (each extra root is either itself an images root, or a parent directory whose subdirectories each
   are one — see README's "Extra image folders").
2. Reads `config.json` (styles/defaultStyle/styleLabels/animations), `characters/characters.json`
   (category/serie/tags per character), and `pose-filters.json` (regex-based synthetic pose filters) —
   all validated with Ajv schemas, falling back to sane defaults on missing/malformed files.
3. Walks `characters/{style}/{character}/*.png` for the main root and each extra root, parsing each
   filename into a pose name/base name/variant number (`parsePoseName` — trailing digits are the
   variant, e.g. `Full 2.png`).
4. Merges everything into one `ILibraryData` (see [src/types/library.ts](src/types/library.ts)),
   computing character summaries, pose summaries, and derived filter option lists.
5. Tracks "new" images via a **first-seen cache** (JSON file under `SD_CACHE_DIR`, one entry per
   relative path) so a file's `isNew` flag survives across requests.
6. Caches the whole computed `ILibraryData` itself (a separate cache file), invalidated by comparing
   directory/file mtime snapshots on every read — bump `LIBRARY_INDEX_CACHE_VERSION` when
   `ILibraryData`'s shape changes, or a stale cache from a previous version gets returned as-is with
   new fields silently `undefined`.

Extra-root images are addressed with a virtual path prefix `extra-roots/{index}/...` so the same
`relativePath`/`path` query param used everywhere (view, delete, mark) can point into any root
without collisions; `getRelativePathRootPrefix` / `resolveImageFilePath` translate between the two.
Path resolution for any on-disk file access always goes through `resolveFilePathUnderRoot`, which
constrains reads/writes to `{root}/characters/**/*.png` — never bypass this when touching files.

Side-effect files always live in the **main root only** (never an extra root), even for images that
physically live in an extra root: `config.json`, `characters/characters.json`,
`pose-filters.json`, `duplicate-reviews.json`, `to-upscale.json`, `to-animate.json`.

### API routes (`src/app/api/**/route.ts`)

Thin wrappers around `image-library.ts`/`auth.ts`:

- `GET /api/library` — the computed `ILibraryData`.
- `GET /api/image` — streams a PNG (or `.preview.jpg` with `variant=preview`), with ETag/Last-Modified
  caching derived from file size+mtime.
- `GET/PUT/DELETE /api/marks` — upscale/animate marking (mutation routes require `SD_ALLOW_DELETE`).
- `GET /api/duplicates` (+ mutation logic in the same file) — duplicate-group detection/validation;
  validation deletes unselected duplicates and renumbers survivors within one directory.
- `GET /api/metadata` — reads PNG "parameters" text chunk metadata via `png-chunks-extract`.
- `/api/auth/login`, `/api/auth/session` — password auth (see below).

All mutation endpoints gate on `SD_ALLOW_DELETE` (see [src/lib/env.ts](src/lib/env.ts)'s
`readBooleanEnvFlag`) and must call `removeMarkedActionEntries`/`removeFirstSeenCacheEntry` when an
image is deleted or renamed, so marks/cache never reference a path that no longer exists.

### Auth

Optional password gate ([src/lib/auth.ts](src/lib/auth.ts)): `SD_PASSWORD` set without
`SD_PASSWORD_SALT` is a startup misconfiguration the UI surfaces explicitly. Passwords are hashed
with `scryptSync` and compared with `timingSafeEqual`; the resulting token is stored in a cookie
(`sd_auth`). No password configured means every request is treated as authenticated.

### Frontend structure

- [src/app/page.tsx](src/app/page.tsx) → [src/components/ImageViewerApp.tsx](src/components/ImageViewerApp.tsx)
  is the top-level client component: owns auth-gate state, the URL query string (via
  `useSearchParams`/`router.push`, not local-only state — filters are shareable/bookmarkable URLs,
  see [src/components/image-viewer/common/persistent-filters.ts](src/components/image-viewer/common/persistent-filters.ts)),
  the side menu, and the image detail/duplicate-finder modals.
- [src/components/ImageViewerBody.tsx](src/components/ImageViewerBody.tsx) renders one of three major
  views (`character` / `style` / `pose`, `TMajorFilter`) under `src/components/image-viewer/{charactersView,stylesView,posesView}/`.
- `src/components/image-viewer/common/` holds shared filter/query-string logic and utilities used
  across views — check here before adding new filter state.
- `src/components/image-viewer/image/` has the lazy-loading image components (`LazyImage`,
  `LazyImagePreview`, `LazyImageMagnifier`) that request `/api/image` with the `preview` variant for
  grid thumbnails and the full PNG for the detail modal/magnifier.
- MUI theming: [src/theme.ts](src/theme.ts) + [src/components/AppProviders.tsx](src/components/AppProviders.tsx),
  using MUI's CSS-variables color scheme with a custom cookie-backed `storageManager` (not
  localStorage-only) so the server-rendered theme mode matches the client on first paint.

### Conventions to follow

- Interfaces are prefixed `I` (`IImageItem`, `ILibraryData`), type aliases prefixed `T`
  (`TMajorFilter`, `TCharacterSortOrder`) — see [src/types/library.ts](src/types/library.ts).
- Env var names are centralized as `*_ENV_KEY` constants in
  [src/lib/env-keys.ts](src/lib/env-keys.ts) — import from there rather than hardcoding
  `process.env.SD_*` strings, and always read env through `ensureLocalEnvLoaded()` first (loads
  `.env.local`/`.env` exactly once via `@next/env`).
- Natural/locale-aware sorting (`compareNatural`, `localeCompare` with `numeric: true`) is used
  throughout `image-library.ts` for filenames/character names so `"Full 2"` sorts before `"Full 10"`.
- `oxlint`/`oxfmt` are the linter/formatter (not ESLint/Prettier directly, though oxlint wraps
  ESLint-compatible plugins) — run `pnpm format`/`pnpm lint` rather than reaching for `eslint`/`prettier`.
