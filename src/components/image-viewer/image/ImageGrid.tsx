"use client";

import { Box } from "@mui/material";

import type { IImageItem } from "@/types/library";

import { ImageCard } from "@/components/image-viewer/image/ImageCard";

import { GRID } from "../common/constants";
import { LoadMoreSentinel } from "../common/LoadMoreSentinel";
import { useIncrementalList } from "../common/useIncrementalList";

interface IImageGridProps {
  images: readonly IImageItem[];
  // Changes whenever the grid shows a different selection (filters, style, sort...), which
  // brings it back to its first page.
  resetKey: string;
  pageSize?: number;
  showNewBadge: boolean;
  showDate?: boolean;
  styleLabel: (style: string) => string;
  onImageSelect: (image: IImageItem) => void;
}

// The image card grid shared by the Styles, Poses and character views, rendered a page at a time
// (see useIncrementalList). Navigation in the detail view and the random pick still use the full
// filtered list, not just the rendered page.
export const ImageGrid = ({
  images,
  resetKey,
  pageSize,
  showNewBadge,
  showDate = false,
  styleLabel,
  onImageSelect,
}: Readonly<IImageGridProps>) => {
  const { visibleItems, hasMore, showMore } = useIncrementalList(images, resetKey, pageSize);

  return (
    <>
      <Box sx={GRID}>
        {visibleItems.map((image) => (
          <ImageCard
            key={image.id}
            image={image}
            showNewBadge={showNewBadge}
            showDate={showDate}
            styleLabel={styleLabel}
            onSelect={onImageSelect}
          />
        ))}
      </Box>
      {hasMore && <LoadMoreSentinel key={visibleItems.length} onVisible={showMore} />}
    </>
  );
};
