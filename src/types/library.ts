export const STYLES = ["realistic", "3d", "anime"] as const;

export type TStyle = (typeof STYLES)[number];

export type TMajorFilter = "character" | "style" | "pose";

export interface IImageItem {
  id: string;
  style: TStyle;
  characterName: string;
  poseName: string;
  poseBaseName: string;
  poseVariant: number;
  relativePath: string;
  isNew: boolean;
}

export interface ICharacterSummary {
  name: string;
  imageCount: number;
  poseCount: number;
  styles: TStyle[];
  thumbnailsByStyle: Partial<Record<TStyle, string>>;
  category: string | null;
  serie: string | null;
}

export interface IMetadataFilterOption {
  id: string;
  type: "category" | "serie";
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

export interface ILibraryData {
  rootConfigured: boolean;
  rootPath: string | null;
  defaultStyle: TStyle;
  styles: TStyle[];
  images: IImageItem[];
  characters: ICharacterSummary[];
  poses: IPoseSummary[];
  posePatternFilters: IPosePatternFilter[];
  warning: string | null;
  cacheAvailable: boolean;
}
