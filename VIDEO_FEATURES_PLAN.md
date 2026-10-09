# Video Extend/Upscale, Nested Animation Config, and Video Provenance Links

## Context

Today the app only supports marking **images** for external Upscale/Animate processing
(`to-upscale.json`/`to-animate.json`), and `config.json`'s `animations` field is a flat
`string[]` of action names shown in a dropdown. Recent work merged basic video support
(`.mp4` files indexed alongside `.png`, own thumbnail pipeline), but videos are second-class:
no Upscale/Animate-equivalent marking, no link back to the image (or video) they were
generated from, and no way to know which pose/action produced them. This plan closes that
gap: videos get their own Extend/Upscale marking, generated videos are named after the pose
they represent, a persisted link ties every generated video back to its source, animations
gain nested sub-versions with per-node prompts, and a new "Edit Animation" flow lets the
prompt be tuned before an external tool consumes the mark. The app itself never runs any
generation — it only records requests (mark files) for an external tool to read, and later
reconciles newly-appeared video files against those pending requests.

This plan is designed to be implemented across multiple sessions — each phase (§Phases) is
independently mergeable and testable, with later phases building on earlier ones' types and
functions rather than their UI.

## Judgment calls (confirmed or made during planning — override by editing the phase)

1. **Confirmed by user**: "sub-versions of a pose" means nesting variants *under an animation
   config entry* (e.g. `Dance` → `Latin Dance`/`Sensual Dance`), each with its own prompt —
   not a general image-pose-grouping feature.
2. **Confirmed by user**: video→source links persist in a new `video-links.json`, populated
   automatically by matching newly-indexed unclaimed videos to pending marks.
3. **Confirmed by user**: video mark entries (`to-extends.json`/`to-upscale-video.json`) reuse
   the *original source image's* metadata string, resolved via the link chain.
4. **Confirmed by user**: `config.json`'s old `animations: string[]` auto-migrates in memory to
   `{key,name,prompt}[]` (each string → `{key: s, name: s, prompt: ""}`) — no on-disk rewrite,
   no breaking change.
5. `library.animations` is exposed to the client as the **full tree** (`IAnimationConfig[]`),
   not flattened — the two-level menu needs the structure.
6. Mark `action` fields store the node's **`key`**, not its display `name` (names aren't
   guaranteed unique across nesting; keys are the stable identifier for prompt/config lookup).
   The UI resolves key→name for display.
7. `video-links.json` is **not** folded into `ILibraryData`/the index cache. It's fetched
   on-demand per-video via `GET /api/marks`, exactly like today's per-image upscale/animate
   state. Only the `animations` shape change forces a `LIBRARY_INDEX_CACHE_VERSION` bump.
8. "Edit Animation" reuses the existing `PUT /api/marks` upsert (now carrying an optional
   `prompt`) instead of a new PATCH-prompt endpoint — one code path per mark type.
9. Redraw-on-video renames the file (frees the name) exactly like Redraw-on-image today, *plus*
   re-queues a mark — symmetry with existing non-destructive Redraw semantics.
10. The app **never renames or validates** a generated video's filename against config. It only
    reads whatever the external tool wrote. A name that doesn't match any animation's `name`
    just never gets claimed by reconciliation — no error, no retry.
11. Reconciliation runs only during an uncached `readImageLibrary()` rebuild (directory mtime
    changed) — a cache hit means nothing new could be claimed.
12. Orphaned pending marks (source deleted, or `action` key removed from config) stay pending
    forever — same as existing `to-upscale.json`/`to-animate.json` behavior today. Not solved
    here.
13. No new env vars — every new endpoint gates on the existing `SD_ALLOW_DELETE` flag.

## Data model

### `src/types/library.ts`

```ts
export interface IAnimationConfig {
  key: string;
  name: string;
  prompt: string;
  subVersions?: IAnimationConfig[];
}
```
`ILibraryData.animations: string[]` → `IAnimationConfig[]`.

### `src/lib/image-library.ts`

- `ILibraryConfig.animations?: string[]` → `unknown[]` (Ajv schema relaxed to
  `{ type: "array" }` with no `items` constraint — shape is validated by a normalizer, not
  Ajv, since the type is recursive).
- `IStyleConfig.animations: string[]` → `IAnimationConfig[]`.
- New `normalizeAnimationsConfig(raw: unknown): IAnimationConfig[]` (exported, tested)
  handling: plain strings → `{key,name,prompt:""}` leaves; objects validated by a
  `isAnimationConfigNode` guard (`key`/`name` required strings, `prompt` optional string
  defaulting to `""`, `subVersions` recursively normalized); invalid entries silently skipped
  (matches `readMarkedImageMap`'s existing leniency). Replaces every
  `normalizeStyleNames(parsedContent.animations)` call in `readStyleConfig`.
- New `findAnimationNodeByKey(animations, key): IAnimationConfig | null` — recursive lookup
  through `subVersions`, used by mark validation, reconciliation, and redraw-requeue.
- New shared mark entry shape:
  ```ts
  export interface IAnimationMarkEntry { metadata: string; action: string; prompt: string; }
  export type IToAnimateEntry = IAnimationMarkEntry;
  export type IToExtendEntry = IAnimationMarkEntry;
  ```
  `prompt` is required in the type but tolerated as missing on read (defaults to `""`) so
  pre-existing `to-animate.json` files without it still parse. `setToAnimateEntry` gains a 5th
  param: `(rootPath, relativePath, metadata, action, prompt)` — update its one call site in
  `handleAnimateMark`.
- New file constants: `TO_EXTEND_FILE_NAME = "to-extends.json"`,
  `TO_UPSCALE_VIDEO_FILE_NAME = "to-upscale-video.json"`,
  `VIDEO_LINKS_FILE_NAME = "video-links.json"` (all main-root only, same as existing mark
  files).
- New functions mirroring `readToAnimateEntries`/`setToAnimateEntry`/`removeToAnimateEntry`
  (`src/lib/image-library.ts:707-739`) and `readToUpscaleEntries`/`setToUpscaleEntry`/
  `removeToUpscaleEntry` (`:676-704`), all through the existing `withMarkedImageFileLock`
  (`:664-674`):
  ```ts
  export const readToExtendEntries, setToExtendEntry, removeToExtendEntry;
  export const readToUpscaleVideoEntries, setToUpscaleVideoEntry, removeToUpscaleVideoEntry;
  export const readVideoLinks, removeVideoLink;
  export const migrateVideoLink; // rekeys a link on rename, returns the migrated record or null
  ```
  ```ts
  export interface IVideoLink {
    sourceRelativePath: string;
    sourceMediaType: TMediaType; // "image" | "video" — chains for extend-of-video
    action: string;   // IAnimationConfig.key used
    prompt: string;   // prompt actually used at fulfillment time (post-edit, if any)
    metadata: string; // carried-forward metadata string
    linkedAt: number; // diagnostic only
  }
  ```
- `removeMarkedActionEntries` (`:1813-1830`) extended to also clear
  `to-extends.json`/`to-upscale-video.json` (still best-effort `Promise.all`, still called from
  the same two existing sites in `src/app/api/image/route.ts` — no new call sites needed for
  this half). `video-links.json` cleanup is handled separately (§Phase 7) since it rekeys on
  rename rather than deleting like the mark files do.

## Claiming/reconciliation algorithm (the riskiest, most novel piece)

New function `reconcilePendingAnimationMarks(rootPath, imageItems, animations)`, called once
inside `readImageLibrary()`'s uncached rebuild path, right after `applyPosePatternFilterIds`
and before `toLibraryData(...)`. Wrapped in try/catch — must never fail a library read.

1. Load `to-animate.json`, `to-extends.json`, `video-links.json`.
2. Build `itemsByRelativePath` from `imageItems` to resolve each pending mark's `style`/
   `characterName` without parsing paths.
3. Build a pending-claims queue keyed by `${style}::${characterName}::${targetName}`
   (`targetName` = the resolved animation node's `name`), iterating `to-animate.json` entries
   first, then `to-extends.json`, in file order — this fixed order is the documented tie-break.
   Skip (leave pending) entries whose source no longer exists or whose `action` key no longer
   resolves in `animations`.
4. Build an unclaimed-videos map with the same group key: `mediaType === "video"`, main-root
   only, `relativePath` not already a key in `video-links.json`. Sort each group by
   `poseVariant` ascending (the existing collision-numbering convention is the only available
   proxy for generation order), tie-broken by `modifiedAt`.
5. Zip each group's claims to its candidates pairwise (FIFO). Each pair writes a
   `video-links.json` entry (carrying `action`/`prompt`/`metadata` from the claim) and queues
   the claim's source for removal from whichever mark file it came from.
6. Batch-remove fulfilled marks, then persist `video-links.json` once, through its own
   `withMarkedImageFileLock`-guarded write so a concurrent redraw-triggered
   `migrateVideoLink`/`removeVideoLink` can't interleave.

`parsePoseName` (`:741-769`) already gives two videos animated to the same target name
(`Dance.mp4`, `Dance 2.mp4`) distinct `poseVariant`s for free — no new parsing logic needed.
Flag to the user: when generation order and mark-insertion order diverge, the FIFO pairing can
silently mis-attribute a link — this is the one accepted heuristic risk in the whole design.

New dedicated test file: `src/lib/reconcile-pending-animation-marks.test.ts` (kept separate
from the already-large `image-library.test.ts`). Cover: single clean claim; no candidates; no
marks; multi-claim FIFO pairing; orphaned source; stale action key; extra-root video excluded;
already-linked video untouched; cross-file ordering; concurrent-write safety.

## API routes (`src/app/api/marks/route.ts`)

Replace the blanket `isVideoFilePath` early-reject in GET/PUT/DELETE (currently lines
43-45/121-123/164-166, rejecting *all* video paths) with type-aware gating:
`upscale`/`animate` stay image-only, new `extend`/`upscaleVideo` are video-only.

- **GET**: image response gains `animate.prompt`. Video response (new):
  `{ upscaleVideo: boolean; extend: {action, prompt} | null; link: IVideoLink | null }` — `link`
  powers the "came from X" UI.
- **PUT**: body gains optional `prompt`. `handleAnimateMark`'s validation
  (`library.animations.includes(action)`, line 84) becomes
  `findAnimationNodeByKey(library.animations, action) !== null` (keys, not names, may be
  nested); if `prompt` is omitted, seed from the resolved node's configured `prompt`. New
  `type: "extend"` and `type: "upscaleVideo"` branches: reject non-video paths; resolve
  `metadata` server-side from `readVideoLinks(rootPath)[path]?.metadata ?? ""` (never accept
  client-supplied metadata for video, since there's no PNG chunk to source it from).
- **DELETE**: add `extend`/`upscaleVideo` cases mirroring `upscale`/`animate`.

Update `src/app/api/marks/route.test.ts` with: extend/upscaleVideo PUT+DELETE happy paths,
cross-rejection (extend-on-image, upscale-on-video, etc.), GET-on-video shape including `link`,
prompt seed-vs-override, nested sub-version `action` validation.

## Redraw-on-video (`src/app/api/image/route.ts` PATCH)

No client change — `handleRedrawClick` already calls `PATCH /api/image?path=` for both media
types. After the existing rename + cache/mark cleanup (unchanged for images), add for videos:
call `migrateVideoLink(rootPath, oldRelativePath, newRelativePath)`; if it returns a link,
requeue a mark in whichever file matches `sourceMediaType` (`setToAnimateEntry` for `"image"`,
`setToExtendEntry` for `"video"`) using the link's `sourceRelativePath`/`metadata`/`action`/
`prompt` — this is the literal "re-request generation using the same source + action + prompt".
Response gains `requeued: boolean` (additive, existing clients only read `newPath`). No link
found → rename still happens, `requeued: false`, no throw.

New tests in `src/app/api/image/route.test.ts`: video redraw with an image-sourced link,
with a video-sourced link, without a link; confirm image redraw is unaffected (no
`migrateVideoLink` call).

## Edit Animation prompt editing

No new field beyond `IAnimationMarkEntry.prompt` and the GET response's `{action, prompt}`
(above). In `ImageDetailModal.tsx`: once a mark exists (`animateAction`/`extendAction` set),
render an "Edit Animation" button opening a `Dialog` modeled on the existing delete-confirm
dialog (`:808-825`) with a multiline `TextField` seeded from the current prompt. Save re-sends
the same `PUT /api/marks` (§API routes) with the edited `prompt`. Reconciliation (above) already
copies `claim.entry.prompt` verbatim into the new `IVideoLink.prompt`, which is why `prompt`
had to be a real persisted field rather than always-recomputed from config — it's what makes an
edited value survive into the link record and back out again via Redraw-on-video.

## UI (`src/components/image-viewer/details/ImageDetailModal.tsx`)

- Prop `animations?: IAnimationConfig[]` (propagates from
  `src/components/ImageViewerApp.tsx:657`, passing `library.animations` through unchanged).
- Button bar (`:622-660`): invert today's `!isVideo` gates to `isVideo` for new Extend/
  Upscale-video buttons, alongside the existing always-shown Redraw/Delete.
- Two-level menu: MUI has no built-in nested `Menu` and none exists elsewhere in this
  codebase, so flatten with depth-based indentation:
  ```ts
  const flattenAnimations = (nodes: IAnimationConfig[], depth = 0): { key; name; depth }[] =>
    nodes.flatMap((n) => [{ key: n.key, name: n.name, depth }, ...(n.subVersions ? flattenAnimations(n.subVersions, depth + 1) : [])]);
  ```
  Reuse the existing `Menu`/`MenuItem` machinery (`:791-806`) for both the image Animate menu
  and the new video Extend menu, just fed different lists/handlers. `data-action` now carries
  the node's `key`; button labels resolve key→name via `findAnimationNodeByKey` client-side.
- "Came from X" block: in the video branch (`:704-712` area), when the GET response's `link`
  is non-null, show e.g. "Extended from Base (Dance)" resolving `link.sourceRelativePath`'s
  filename and `link.action`'s name. `link === null` shows nothing (not an error state).
- New `ImageDetailModal.test.tsx` (none exists today; model on
  `DuplicateFinderModal.test.tsx`'s fetch-mock pattern): button gating by media type, flattened
  menu with indentation, sub-version selection sends `key` not `name`, Edit Animation round
  trip, "came from X" rendering.

## Cache/versioning

Bump `LIBRARY_INDEX_CACHE_VERSION` (`src/lib/image-library.ts:40`, currently `6`) to **7** —
the only reason needed is `ILibraryData.animations`'s shape change. `video-links.json`/the new
mark files are deliberately excluded from `collectConfigFileSnapshots`'s watch list (they're
fetched on-demand, never baked into cached `ILibraryData`), and reconciliation's correctness
relies purely on the directory-mtime invalidation that already exists whenever a video file
appears.

## Phases (each independently shippable)

1. **Config schema + migration.** `IAnimationConfig`, `normalizeAnimationsConfig`,
   `findAnimationNodeByKey`, relaxed Ajv schema, type changes, cache version bump to 7, update
   `handleAnimateMark` validation, update client prop type + key-based flat-menu rendering for
   the *existing* image Animate flow. Old string-array configs keep working unchanged.
2. **Plain video marks, no linking yet.** New types/read/write/remove functions for
   `to-extends.json`/`to-upscale-video.json`, `removeMarkedActionEntries` extended, `/api/marks`
   `extend`/`upscaleVideo` types (metadata resolves to `""` until Phase 3 exists),
   Extend/Upscale-video buttons wired up in the UI.
3. **Linking/reconciliation engine.** `IVideoLink`, `video-links.json` functions,
   `reconcilePendingAnimationMarks` wired into `readImageLibrary()`. Switch Phase 2's metadata
   resolution to read the real link. Ship behind the dedicated test suite before touching UI.
4. **Video naming + pose-filter verification.** No new mechanism expected — pose counting
   already runs over every `IImageItem` including videos, so animation-named videos should
   already surface as pose filter chips. Write regression tests confirming this with realistic
   fixtures (now possible thanks to Phase 3). Only fall back to real implementation work here
   if a genuine gap is found.
5. **Edit-prompt UI.** `prompt` on mark entries/GET/PUT, "Edit Animation" button + dialog.
   Depends on Phase 1 (nodes have prompts) and Phase 2 (mark entries exist to edit).
6. **"Came from X" display.** GET `link` field, UI block. Depends on Phase 3.
7. **Redraw-on-video.** Last — depends on `video-links.json` (Phase 3) and requeues with
   `prompt` (Phase 5) so the exact edited prompt survives, not the config default.

## Testing strategy

| File | New cases |
|---|---|
| `src/lib/image-library.test.ts` | `normalizeAnimationsConfig` (string migration, nested, invalid entries, missing prompt default); `findAnimationNodeByKey`; relaxed Ajv schema; `animations` shape end-to-end via `readImageLibrary`; new extend/upscale-video/video-link read/write/remove/migrate functions; `removeMarkedActionEntries` clearing all four mark files. |
| `src/lib/reconcile-pending-animation-marks.test.ts` (new) | Full matrix from §Claiming/reconciliation algorithm. |
| `src/app/api/marks/route.test.ts` | extend/upscaleVideo PUT+DELETE, cross-rejection, GET-on-video shape, prompt seed/override, nested action validation. |
| `src/app/api/image/route.test.ts` | Video redraw with image-sourced link, video-sourced link, no link; image redraw unaffected. |
| `src/components/image-viewer/details/ImageDetailModal.test.tsx` (new) | Button gating, flattened menu, sub-version key selection, Edit Animation round trip, "came from X" rendering. Not coverage-gated (`.tsx`) but valuable given the new interactive surface. |

## Verification

- `pnpm typecheck` and `pnpm lint:ci` after each phase.
- `pnpm test` (coverage thresholds: statements/lines 96%, functions 98%, branches 88%) —
  every new `src/lib`/route function needs tests to hold the gate; run
  `vitest run src/lib/image-library.test.ts src/lib/reconcile-pending-animation-marks.test.ts
  src/app/api/marks/route.test.ts src/app/api/image/route.test.ts` while iterating on a phase.
- Manual end-to-end check via `pnpm dev`: create a `config.json` with a nested animation
  (`Dance` + `Latin Dance`/`Sensual Dance` sub-versions), mark an image Animate with a
  sub-version, drop a matching `Dance.mp4` into the character folder, reload the library and
  confirm `video-links.json` gets the entry and the mark is cleared; open the video's detail
  modal and confirm "came from" + Extend/Upscale-video buttons + Edit Animation all appear and
  round-trip correctly; click Redraw on that video and confirm `to-animate.json` gets a fresh
  entry with the original prompt.
- `pnpm build` (the pre-push check) must pass before considering any phase done.

## Progress tracking

Mark phases done here as they're completed, so a future session on another machine can pick
up where this one left off:

- [x] Phase 1 — Config schema + migration
- [x] Phase 2 — Plain video marks, no linking yet
- [x] Phase 3 — Linking/reconciliation engine
- [x] Phase 4 — Video naming + pose-filter verification
- [x] Phase 5 — Edit-prompt UI
- [x] Phase 6 — "Came from X" display
- [x] Phase 7 — Redraw-on-video
