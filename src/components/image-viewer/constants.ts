import type { ILibraryData } from "@/types/library";

export const SIDEBAR_WIDTH = 280;
export const WITH_SOMEBODY_FILTER = "__with_somebody__";

export const DEFAULT_LIBRARY: ILibraryData = {
  rootConfigured: false,
  rootPath: null,
  defaultStyle: "3d",
  styles: ["realistic", "3d", "anime"],
  images: [],
  characters: [],
  poses: [],
  warning: null,
};
