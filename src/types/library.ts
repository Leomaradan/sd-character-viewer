export const STYLES = ["realistic", "3d", "anime"] as const;

export type TMajorFilter = "character" | "style" | "pose";

export type TCharacterSortOrder = "name" | "date";

export type TMediaType = "image" | "video";

export type TMediaTypeFilter = TMediaType | "both";

// "Bad" is set by the Redraw action: the file is renamed to free its pose name, and the renamed
// file is rated "bad" so it stays out of the "Unrated" selection.
export type TRating = "bad" | "ok" | "good";

export type TRatingFilterOption = "unrated" | "ok" | "good";

// The ratings to show; empty means no rating filter (everything, bad files included).
export type TRatingFilter = readonly TRatingFilterOption[];

export interface IImageItem {
  id: string;
  style: string;
  characterName: string;
  poseName: string;
  poseBaseName: string;
  // poseBaseName without "[...]" annotations, and for an "Animation (Pose)" video just the pose
  // part - what the pose filters match against (see getPoseFilterName).
  poseFilterName: string;
  poseVariant: number;
  relativePath: string;
  isNew: boolean;
  firstSeenAt: number;
  modifiedAt: number;
  posePatternFilterIds: string[];
  mediaType: TMediaType;
  // From ratings.json; absent when the file hasn't been rated.
  rating?: TRating;
  // True when an Upscale/Animate/Extend mark is waiting on the file; absent otherwise.
  hasPendingAction?: boolean;
}

export interface ICharacterSummary {
  name: string;
  imageCount: number;
  poseCount: number;
  styles: string[];
  thumbnailsByStyle: Partial<Record<string, string>>;
  thumbnailModifiedAtByStyle: Partial<Record<string, number>>;
  category: string | null;
  serie: string | null;
  tags: string[];
  firstSeenAt: number;
}

export interface IMetadataFilterOption {
  id: string;
  type: "category" | "serie" | "tag";
  value: string;
  label: string;
}

export interface IPoseSummary {
  name: string;
  imageCount: number;
}

export interface IPosePatternFilter {
  id: string;
  label: string;
  pattern: string;
  flags?: string;
}

export interface IPoseFilterOption {
  value: string;
  label: string;
}

export interface IDuplicateGroup {
  id: string;
  style: string;
  characterName: string;
  poseBaseName: string;
  images: IImageItem[];
}

// One LoRA to apply: its name, trigger word and weight, each optional.
export interface IAnimationLora {
  lora?: string;
  trigger?: string;
  weight?: number;
}

// Optional generation hints copied verbatim from the chosen animation node into its mark entry,
// for the external tool that consumes to-animate.json/to-extends.json. `loras` lists extra LoRAs
// for an animation that needs several, alongside (or instead of) the single lora/trigger/weight.
export interface IAnimationGenerationOptions extends IAnimationLora {
  loras?: IAnimationLora[];
}

// `prompt` is always normalized to an array of candidate lines (one is picked at random when an
// image is marked). An empty array means the node only exists to group its subVersions - one of
// which is picked at random instead. A node with neither is dropped at normalization time.
interface IAnimationConfigSubVersion extends IAnimationGenerationOptions {
  key: string;
  name: string;
  prompt: string[];
  subVersions?: IAnimationConfigSubVersion[];
}

export interface IAnimationConfig extends IAnimationGenerationOptions {
  key: string;
  name: string;
  prompt: string[];
  subVersions?: IAnimationConfigSubVersion[];
}

// Persisted once a generated video is matched back to the pending mark that requested it. Not
// folded into ILibraryData/the index cache - fetched on-demand per-video via GET /api/marks.
export interface IVideoLink {
  sourceRelativePath: string;
  sourceMediaType: TMediaType; // "image" for an animate source, "video" for an extend source
  action: string; // IAnimationConfig.key used
  prompt: string; // prompt actually used at fulfillment time (post-edit, if any)
  metadata: string; // carried-forward metadata string
  linkedAt: number; // diagnostic only
}

export interface ILibraryData {
  rootConfigured: boolean;
  rootPath: string | null;
  defaultStyle: string;
  styles: string[];
  styleLabels?: Partial<Record<string, string>>;
  animations: IAnimationConfig[];
  // config.json "poses": the standard pose names the Pose Conformity tool checks files against.
  standardPoses: string[];
  // config.json "specialPoses": poses that exist and count as conforming, but aren't offered as
  // rename targets in the Pose Conformity tool.
  specialPoses: string[];
  images: IImageItem[];
  characters: ICharacterSummary[];
  poses: IPoseSummary[];
  posePatternFilters: IPosePatternFilter[];
  poseFilterOptions: IPoseFilterOption[];
  metadataFilterOptions: IMetadataFilterOption[];
  characterMetadataFilterIdsByName: Record<string, string[]>;
  warning: string | null;
  cacheAvailable: boolean;
}
