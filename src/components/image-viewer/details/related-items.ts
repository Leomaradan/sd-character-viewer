import type { IImageItem, IVideoLink } from "@/types/library";

import { stripAnnotations } from "@/lib/pose-name";

type TRelatedItemRelation = "source" | "derived" | "version";

export interface IRelatedItem {
  relation: TRelatedItemRelation;
  relativePath: string;
  // "Animated from", "Extension", "Version"...
  label: string;
  // The file name without its extension, plus the animation used when known.
  name: string;
  // null when the file isn't in the library (anymore): shown, but not openable.
  image: IImageItem | null;
}

// A video generated from the shown file, from GET /api/marks's `derived`.
export interface IDerivedVideo {
  relativePath: string;
  action: string;
}

interface IBuildRelatedItemsOptions {
  image: IImageItem;
  images: readonly IImageItem[];
  // The shown video's own link (where it was generated from); null for an image or unlinked video.
  videoLink: IVideoLink | null;
  derived: readonly IDerivedVideo[];
  animationName: (action: string) => string;
}

const splitPath = (relativePath: string): { directory: string; stem: string } => {
  const separatorIndex = relativePath.lastIndexOf("/");
  const fileName = relativePath.slice(separatorIndex + 1);
  const extensionIndex = fileName.lastIndexOf(".");
  return {
    directory: relativePath.slice(0, separatorIndex + 1),
    stem: extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName,
  };
};

const pathOf = (item: { relativePath: string }): string => item.relativePath;

const compareByName = (a: IRelatedItem, b: IRelatedItem): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

// The files linked to the shown one: the file it was animated/extended from, the videos
// generated from it (video-links.json), and its other versions - files of the same type in the
// same folder with the same name once annotations are ignored ("Dance [Extended].mp4" for
// "Dance.mp4", "Casual [Upscaled].png" for "Casual.png"; "Casual 2.png" is another variant, not
// a version).
export const buildRelatedItems = ({
  image,
  images,
  videoLink,
  derived,
  animationName,
}: IBuildRelatedItemsOptions): IRelatedItem[] => {
  const imagesByPath = new Map(images.map((item) => [item.relativePath, item]));
  const isVideo = image.mediaType === "video";
  const items: IRelatedItem[] = [];

  if (videoLink && videoLink.sourceRelativePath !== image.relativePath) {
    items.push({
      relation: "source",
      relativePath: videoLink.sourceRelativePath,
      label: videoLink.sourceMediaType === "video" ? "Extended from" : "Animated from",
      name: splitPath(videoLink.sourceRelativePath).stem,
      image: imagesByPath.get(videoLink.sourceRelativePath) ?? null,
    });
  }

  const derivedItems: IRelatedItem[] = [];
  for (const video of derived) {
    const derivedImage = imagesByPath.get(video.relativePath);
    if (derivedImage && video.relativePath !== image.relativePath) {
      derivedItems.push({
        relation: "derived",
        relativePath: video.relativePath,
        label: isVideo ? "Extension" : "Animation",
        name: `${splitPath(video.relativePath).stem} (${animationName(video.action)})`,
        image: derivedImage,
      });
    }
  }

  const listedPaths = new Set([image, ...items, ...derivedItems].map(pathOf));
  const { directory, stem } = splitPath(image.relativePath);
  const coreName = stripAnnotations(stem).toLowerCase();
  const versionItems: IRelatedItem[] = images
    .filter((item) => {
      if (listedPaths.has(item.relativePath) || item.mediaType !== image.mediaType) {
        return false;
      }

      const candidate = splitPath(item.relativePath);
      return (
        candidate.directory === directory &&
        stripAnnotations(candidate.stem).toLowerCase() === coreName
      );
    })
    .map((item) => ({
      relation: "version",
      relativePath: item.relativePath,
      label: "Version",
      name: splitPath(item.relativePath).stem,
      image: item,
    }));

  return [...items, ...derivedItems.sort(compareByName), ...versionItems.sort(compareByName)];
};
