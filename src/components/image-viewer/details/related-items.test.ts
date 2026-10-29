import { describe, expect, it } from "vitest";

import type { IImageItem, IVideoLink } from "@/types/library";

import { buildRelatedItems } from "./related-items";

const DIR = "characters/3d/Urbosa";

const item = (fileName: string, directory: string = DIR): IImageItem =>
  ({
    relativePath: `${directory}/${fileName}`,
    mediaType: fileName.endsWith(".mp4") ? "video" : "image",
  }) as IImageItem;

const link = (sourceRelativePath: string, sourceMediaType: "image" | "video"): IVideoLink => ({
  sourceRelativePath,
  sourceMediaType,
  action: "doggy",
  prompt: "",
  metadata: "",
  linkedAt: 0,
});

const animationName = (action: string) => (action === "doggy" ? "Doggystyle" : action);

const sheik = item("With Sheik.png");
const doggy = item("Doggy (Doggystyle).mp4");
const doggyExtended = item("Doggy (Doggystyle) [Extended].mp4");
const images = [
  sheik,
  item("With Sheik 2.png"),
  item("With Sheik [Upscaled].png"),
  item("With Sheik.mp4"),
  item("With Sheik [Upscaled].png", "characters/3d/Zelda"),
  doggy,
  doggyExtended,
];

const summarize = (items: ReturnType<typeof buildRelatedItems>) =>
  items.map(({ label, name, image }) => [label, name, image !== null]);

describe("buildRelatedItems", () => {
  it("lists a video's source, its extensions and its other versions", () => {
    const related = buildRelatedItems({
      image: doggy,
      images,
      videoLink: link(sheik.relativePath, "image"),
      derived: [{ relativePath: doggyExtended.relativePath, action: "doggy" }],
      animationName,
    });

    // The extension is listed once, as an extension (not again as a version).
    expect(summarize(related)).toEqual([
      ["Animated from", "With Sheik", true],
      ["Extension", "Doggy (Doggystyle) [Extended] (Doggystyle)", true],
    ]);
    expect(related[0].image).toBe(sheik);
  });

  it("lists an image's animations and same-type versions in its folder only", () => {
    const related = buildRelatedItems({
      image: sheik,
      images,
      videoLink: null,
      derived: [
        { relativePath: doggy.relativePath, action: "doggy" },
        { relativePath: `${DIR}/Deleted.mp4`, action: "doggy" },
      ],
      animationName,
    });

    expect(summarize(related)).toEqual([
      ["Animation", "Doggy (Doggystyle) (Doggystyle)", true],
      ["Version", "With Sheik [Upscaled]", true],
    ]);
  });

  it("finds an unlinked extension by its name, and keeps a missing source as plain text", () => {
    const related = buildRelatedItems({
      image: doggyExtended,
      images,
      videoLink: link(`${DIR}/Gone.mp4`, "video"),
      derived: [],
      animationName,
    });

    expect(summarize(related)).toEqual([
      ["Extended from", "Gone", false],
      ["Version", "Doggy (Doggystyle)", true],
    ]);
  });

  it("ignores links pointing back at the file itself", () => {
    expect(
      buildRelatedItems({
        image: doggy,
        images: [doggy],
        videoLink: link(doggy.relativePath, "video"),
        derived: [{ relativePath: doggy.relativePath, action: "doggy" }],
        animationName,
      }),
    ).toEqual([]);
  });

  it("handles a file name without an extension", () => {
    const bare = { relativePath: "Bare", mediaType: "image" } as IImageItem;
    const bareCopy = { relativePath: "Bare [Copy]", mediaType: "image" } as IImageItem;

    expect(
      summarize(
        buildRelatedItems({
          image: bare,
          images: [bare, bareCopy],
          videoLink: null,
          derived: [],
          animationName,
        }),
      ),
    ).toEqual([["Version", "Bare [Copy]", true]]);
  });
});
