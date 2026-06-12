import {
  buildNextQueryString,
  metadataFilterIdToQueryChanges,
  normalizePoseFilters,
  parseSelectedMetadataFilterId,
  parseSelectedPoseFilters,
} from "@/components/image-viewer/persistent-filters";
import { describe, expect, it } from "vitest";

describe("persistent filters", () => {
  describe("parseSelectedPoseFilters", () => {
    it("reads and trims persisted pose filters", () => {
      const params = new URLSearchParams("pose=Standing&pose=%20Jump%20&pose=%20");

      expect(parseSelectedPoseFilters(params)).toEqual(["Standing", "Jump"]);
    });
  });

  describe("parseSelectedMetadataFilterId", () => {
    it("prefers category over serie when both are present", () => {
      const params = new URLSearchParams("category=Hero&serie=Sample");

      expect(parseSelectedMetadataFilterId(params)).toBe("category::Hero");
    });

    it("reads serie when category is absent", () => {
      const params = new URLSearchParams("serie=Sample");

      expect(parseSelectedMetadataFilterId(params)).toBe("serie::Sample");
    });
  });

  describe("normalizePoseFilters", () => {
    it("deduplicates and removes blank values", () => {
      expect(normalizePoseFilters([" Base ", "", "Base", "Jump", "Jump "])).toEqual([
        "Base",
        "Jump",
      ]);
    });
  });

  describe("metadataFilterIdToQueryChanges", () => {
    it("maps category filter id to query changes", () => {
      expect(metadataFilterIdToQueryChanges("category::Hero")).toEqual({
        category: "Hero",
        serie: null,
      });
    });

    it("maps serie filter id to query changes", () => {
      expect(metadataFilterIdToQueryChanges("serie::Sample")).toEqual({
        category: null,
        serie: "Sample",
      });
    });

    it("clears metadata query params for empty filter ids", () => {
      expect(metadataFilterIdToQueryChanges("")).toEqual({ category: null, serie: null });
      expect(metadataFilterIdToQueryChanges("category:: ")).toEqual({
        category: null,
        serie: null,
      });
    });
  });

  describe("buildNextQueryString", () => {
    it("updates filter params while preserving unrelated query params", () => {
      const params = new URLSearchParams(
        "view=pose&char=alice&pose=Standing&category=Hero&keep=value",
      );

      const next = buildNextQueryString(params, {
        char: null,
        pose: normalizePoseFilters([" Jump ", "Jump", ""]),
        serie: "Main",
        category: null,
      });

      expect(new URLSearchParams(next).toString()).toBe(
        "view=pose&keep=value&pose=Jump&serie=Main",
      );
    });
  });
});
