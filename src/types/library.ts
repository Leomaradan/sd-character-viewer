export const STYLES = ["realistic", "3d", "anime"] as const;

export type TMajorFilter = "character" | "style" | "pose";

export type TCharacterSortOrder = "name" | "date";

export type TMediaType = "image" | "video";

export type TMediaTypeFilter = TMediaType | "both";

export interface IImageItem {
  id: string;
  style: string;
  characterName: string;
  poseName: string;
  poseBaseName: string;
  poseVariant: number;
  relativePath: string;
  isNew: boolean;
  firstSeenAt: number;
  modifiedAt: number;
  posePatternFilterIds: string[];
  mediaType: TMediaType;
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

export interface IAnimationConfig {
  key: string;
  name: string;
  prompt: string;
  subVersions?: IAnimationConfig[];
}

export interface ILibraryData {
  rootConfigured: boolean;
  rootPath: string | null;
  defaultStyle: string;
  styles: string[];
  styleLabels?: Partial<Record<string, string>>;
  animations: IAnimationConfig[];
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
