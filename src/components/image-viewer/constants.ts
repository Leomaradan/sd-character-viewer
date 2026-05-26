import type { ILibraryData } from "@/types/library";

export const SIDEBAR_WIDTH = 280;
export const WITH_SOMEBODY_FILTER = "__with_somebody__";
export const BORDER_RADIUS = { borderRadius: 1 };
export const BORDER_STYLE_DASHED = { borderStyle: "dashed" };
export const PADDING = { p: 2 };
export const MARGIN_BOTTOM = { mb: 2 };
export const MARGIN_TOP_2 = { mt: 2 };
export const MARGIN_TOP_1 = { mt: 1 };
export const STACK_SPACING = { xs: 1, sm: 2 };
export const FLEXWRAP = { flexWrap: "wrap" };
export const GRID = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};

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
