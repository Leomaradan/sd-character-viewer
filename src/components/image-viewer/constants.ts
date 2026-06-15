import type { ILibraryData } from "@/types/library";

export const SIDEBAR_WIDTH = 280;
export const WITH_SOMEBODY_FILTER = "__with_somebody__";
export const BORDER_RADIUS = { borderRadius: 1 };
export const BORDER_STYLE_DASHED = { borderStyle: "dashed" };
export const PADDING = { p: 2 };
export const MARGIN_BOTTOM = { mb: 2 };

export const MARGIN_TOP_1 = { mt: 1 };
export const STACK_SPACING = { xs: 1, sm: 2 };
export const FLEXWRAP = { flexWrap: "wrap" };
export const GRID = {
  display: "grid",
  gap: 2,
  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
};

export const CAPTION_SX = { opacity: 0.7, textTransform: "uppercase" };
export const META_TITLE_SX = { mt: 0.5 };

export const PARAMETERS_BOX_SX = {
  mt: 0.5,
  p: 1,
  bgcolor: "rgba(255,255,255,0.05)",
  borderRadius: 1,
  //maxHeight: 450,
  overflowY: "auto",
  fontFamily: "monospace",
  fontSize: "0.7rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "rgba(255,255,255,0.8)",
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
  cacheAvailable: false,
};
