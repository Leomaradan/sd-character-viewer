interface IQueryParamsReader {
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
  toString: () => string;
}

export type TQueryParamChanges = Record<string, string | string[] | null>;

export const parseSelectedPoseFilters = (queryParams: IQueryParamsReader): string[] => {
  return queryParams
    .getAll("pose")
    .map((pose) => pose.trim())
    .filter((pose) => pose !== "");
};

export const parseSelectedMetadataFilterId = (queryParams: IQueryParamsReader): string => {
  const rawCategoryFilter = queryParams.get("category")?.trim() ?? "";
  const rawSerieFilter = queryParams.get("serie")?.trim() ?? "";

  if (rawCategoryFilter) {
    return `category::${rawCategoryFilter}`;
  }

  if (rawSerieFilter) {
    return `serie::${rawSerieFilter}`;
  }

  return "";
};

export const parseShowOnlyNewImages = (queryParams: IQueryParamsReader): boolean => {
  const rawValue = queryParams.get("new")?.trim().toLowerCase();
  return rawValue === "1" || rawValue === "true";
};

export const normalizePoseFilters = (poses: string[]): string[] => {
  return [...new Set(poses.map((pose) => pose.trim()))].filter((pose) => pose !== "");
};

export const metadataFilterIdToQueryChanges = (metadataFilterId: string): TQueryParamChanges => {
  if (!metadataFilterId) {
    return { category: null, serie: null };
  }

  const [type, ...valueParts] = metadataFilterId.split("::");
  const value = valueParts.join("::").trim();

  if (!value) {
    return { category: null, serie: null };
  }

  if (type === "category") {
    return { category: value, serie: null };
  }

  if (type === "serie") {
    return { serie: value, category: null };
  }

  return {};
};

export const buildNextQueryString = (
  queryParams: IQueryParamsReader,
  changes: TQueryParamChanges,
): string => {
  const nextParams = new URLSearchParams(queryParams.toString());

  for (const [key, value] of Object.entries(changes)) {
    if (Array.isArray(value)) {
      nextParams.delete(key);

      for (const item of value) {
        const normalizedItem = item.trim();
        if (normalizedItem !== "") {
          nextParams.append(key, normalizedItem);
        }
      }
      continue;
    }

    if (value === null || value.trim() === "") {
      nextParams.delete(key);
    } else {
      nextParams.set(key, value);
    }
  }

  return nextParams.toString();
};
