import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { invalidateMetadataCacheEntry } from "@/app/api/metadata/route";
import { isAuthenticatedRequest, isMisconfigured, isPasswordProtectionEnabled } from "@/lib/auth";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";
import {
  findDuplicateGroups,
  getImagesRootPathFromEnv,
  getRelativePathRootPrefix,
  isDuplicateGroupReviewed,
  isVideoFilePath,
  parsePoseName,
  readImageLibrary,
  readReviewedDuplicateGroups,
  removeLibraryIndexCache,
  removeFirstSeenCacheEntry,
  resolveImageFilePath,
  resolvePreviewFilePath,
  writeReviewedDuplicateGroups,
  type IReviewedDuplicateGroup,
} from "@/lib/image-library";

export const dynamic = "force-dynamic";

// Serializes duplicate-group validation per root path: two concurrent requests (e.g. from two
// browser tabs) targeting the same character folder could otherwise read the same directory
// listing before either mutates it, then delete/rename files out from under each other, and a
// later write to the shared duplicate-reviews.json could clobber an earlier one's entry.
const duplicateFinderQueues = new Map<string, Promise<unknown>>();

const withDuplicateFinderLock = <T>(rootPath: string, task: () => Promise<T>): Promise<T> => {
  const previousTask = duplicateFinderQueues.get(rootPath) ?? Promise.resolve();
  const nextTask = previousTask.then(task, task);
  duplicateFinderQueues.set(
    rootPath,
    nextTask.catch(() => {}),
  );
  return nextTask;
};

const isDuplicateManagementAllowed = (): boolean => {
  ensureLocalEnvLoaded();
  return readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);
};

// Renames the kept files into their final "<pose> N.png" sequence and records the reviewed
// group, so the same file set won't reappear as a duplicate group after this validation.
const finalizeKeptFiles = async (params: {
  rootPath: string;
  directory: string;
  primaryFilePath: string;
  additionalFilePaths: string[];
  poseBaseName: string;
  style: string;
  characterName: string;
  toRelativePath: (fileName: string) => string;
  relativePathPrefix: string;
}): Promise<Response> => {
  const {
    rootPath,
    directory,
    primaryFilePath,
    additionalFilePaths,
    poseBaseName,
    style,
    characterName,
    toRelativePath,
    relativePathPrefix,
  } = params;

  const orderedAdditionalFileNames = additionalFilePaths
    .map((filePath) => path.basename(filePath))
    .sort((a, b) => {
      const variantA = parsePoseName(a).poseVariant;
      const variantB = parsePoseName(b).poseVariant;
      if (variantA !== variantB) {
        return variantA - variantB;
      }
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });

  const orderedKeptFileNames = [path.basename(primaryFilePath), ...orderedAdditionalFileNames];

  const renamePlan = orderedKeptFileNames.map((fileName, index) => ({
    currentFileName: fileName,
    targetFileName: index === 0 ? `${poseBaseName}.png` : `${poseBaseName} ${index + 1}.png`,
  }));

  const pendingRenames = renamePlan.filter(
    (entry) => entry.currentFileName !== entry.targetFileName,
  );

  // Two phases, each internally parallel but never overlapping with the other: every pending
  // rename first moves its file to a unique temp name (so a target name freed up by one rename
  // can never collide with another pending rename still reading its old name), and only once all
  // of those have landed does the second phase move everything from its temp name to its real
  // target name. Within each phase every entry touches a distinct file, so running them
  // concurrently can't race.
  const tempRenames = await Promise.all(
    pendingRenames.map(async (entry) => {
      const tempFileName = `.duplicate-finder-tmp-${randomUUID()}.png`;
      const currentFilePath = path.join(directory, entry.currentFileName);
      const tempFilePath = path.join(directory, tempFileName);

      await fs.rename(currentFilePath, tempFilePath);
      await fs
        .rename(resolvePreviewFilePath(currentFilePath), resolvePreviewFilePath(tempFilePath))
        .catch(() => {});

      return {
        tempFileName,
        targetFileName: entry.targetFileName,
        oldRelativePath: toRelativePath(entry.currentFileName),
      };
    }),
  );

  await Promise.all(
    tempRenames.map(async ({ tempFileName, targetFileName, oldRelativePath }) => {
      const tempFilePath = path.join(directory, tempFileName);
      const targetFilePath = path.join(directory, targetFileName);

      await fs.rename(tempFilePath, targetFilePath);
      await fs
        .rename(resolvePreviewFilePath(tempFilePath), resolvePreviewFilePath(targetFilePath))
        .catch(() => {});

      invalidateMetadataCacheEntry(oldRelativePath);
      invalidateMetadataCacheEntry(toRelativePath(targetFileName));
      await removeFirstSeenCacheEntry(oldRelativePath);
    }),
  );

  const finalFileNames = renamePlan
    .map((entry) => entry.targetFileName)
    .toSorted((a, b) => a.localeCompare(b));

  const reviewedGroups = await readReviewedDuplicateGroups(rootPath);
  const remainingReviewedGroups = reviewedGroups.filter(
    (reviewedGroup) =>
      !(
        (reviewedGroup.rootPrefix ?? "") === relativePathPrefix &&
        reviewedGroup.style === style &&
        reviewedGroup.characterName === characterName &&
        reviewedGroup.poseBaseName === poseBaseName
      ),
  );

  const newReviewedGroup: IReviewedDuplicateGroup = {
    style,
    characterName,
    poseBaseName,
    fileNames: finalFileNames,
    rootPrefix: relativePathPrefix,
  };

  await writeReviewedDuplicateGroups(rootPath, [...remainingReviewedGroups, newReviewedGroup]);

  return Response.json({ style, characterName, poseBaseName, fileNames: finalFileNames });
};

export const GET = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const library = await readImageLibrary();

  if (!library.rootConfigured || !library.rootPath) {
    return Response.json({ groups: [] });
  }

  const reviewedGroups = await readReviewedDuplicateGroups(library.rootPath);
  // Videos are never eligible for duplicate detection/renumbering.
  const dedupCandidateImages = library.images.filter((image) => image.mediaType !== "video");
  const groups = findDuplicateGroups(dedupCandidateImages).filter(
    (group) => !isDuplicateGroupReviewed(group, reviewedGroups),
  );

  return Response.json({ groups });
};

interface IValidateRequestBody {
  primaryRelativePath?: unknown;
  additionalKeptRelativePaths?: unknown;
  // When true, every image in the group (including primaryRelativePath) is deleted and nothing is kept.
  rejectAll?: unknown;
}

interface IParsedValidateRequest {
  directory: string;
  primaryFilePath: string;
  additionalFilePaths: string[];
  characterName: string;
  style: string;
  poseBaseName: string;
  rejectAll: boolean;
  toRelativePath: (fileName: string) => string;
  keptFileNames: string[];
  relativePathPrefix: string;
}

// Parses and validates the request body, returning either the parsed data needed to apply the
// change, or an error Response to send back as-is.
const parseValidateRequest = async (
  request: Request,
): Promise<IParsedValidateRequest | Response> => {
  let body: IValidateRequestBody;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    body = (await request.json()) as IValidateRequestBody;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  // Normalized once, up front, so every downstream check and lookup (isCharacterImagePath,
  // resolveImageFilePath, getRelativePathRootPrefix) agrees on the same string instead of some
  // re-normalizing backslashes and others parsing the raw value.
  const primaryRelativePath =
    typeof body.primaryRelativePath === "string"
      ? body.primaryRelativePath.replaceAll("\\", "/")
      : "";
  const rawAdditionalPaths = body.additionalKeptRelativePaths;
  const rejectAll = body.rejectAll === true;

  if (
    !primaryRelativePath ||
    !Array.isArray(rawAdditionalPaths) ||
    rawAdditionalPaths.some((value) => typeof value !== "string")
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const additionalRelativePaths = rejectAll
    ? []
    : [
        ...new Set(
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          (rawAdditionalPaths as string[]).map((relativePath) =>
            relativePath.replaceAll("\\", "/"),
          ),
        ),
      ].filter((relativePath) => relativePath !== primaryRelativePath);

  // Images living in an extra images root carry an "extra-roots/<index>/" prefix ahead of
  // "characters/..." (see getRelativePathRootPrefix in image-library.ts).
  const isCharacterImagePath = (value: string): boolean =>
    value.startsWith("characters/") || /^extra-roots\/\d+\/characters\//.test(value);
  if (
    !isCharacterImagePath(primaryRelativePath) ||
    additionalRelativePaths.some((relativePath) => !isCharacterImagePath(relativePath))
  ) {
    return new Response("Invalid image path", { status: 400 });
  }

  const primaryFilePath = resolveImageFilePath(primaryRelativePath);
  if (!primaryFilePath || isVideoFilePath(primaryFilePath)) {
    return new Response("Invalid image path", { status: 400 });
  }

  const additionalFilePaths: string[] = [];
  for (const relativePath of additionalRelativePaths) {
    const filePath = resolveImageFilePath(relativePath);
    if (!filePath || isVideoFilePath(filePath)) {
      return new Response("Invalid image path", { status: 400 });
    }
    additionalFilePaths.push(filePath);
  }

  const directory = path.dirname(primaryFilePath);
  if (additionalFilePaths.some((filePath) => path.dirname(filePath) !== directory)) {
    return new Response("Images must belong to the same character and style", { status: 400 });
  }

  const characterName = path.basename(directory);
  const style = path.basename(path.dirname(directory));
  const { poseBaseName } = parsePoseName(path.basename(primaryFilePath));

  // Every image resolved to the same on-disk directory above, so they all belong to the same
  // images root; reuse the primary path's root prefix ("" for the main root, or
  // "extra-roots/<index>" for an extra root) to rebuild relativePaths under that same root.
  const relativePathPrefix = getRelativePathRootPrefix(primaryRelativePath);
  const toRelativePath = (fileName: string): string =>
    path.posix.join(relativePathPrefix, "characters", style, characterName, fileName);

  const keptFileNames = rejectAll
    ? []
    : [
        path.basename(primaryFilePath),
        ...additionalFilePaths.map((filePath) => path.basename(filePath)),
      ];

  return {
    directory,
    primaryFilePath,
    additionalFilePaths,
    characterName,
    style,
    poseBaseName,
    rejectAll,
    toRelativePath,
    keptFileNames,
    relativePathPrefix,
  };
};

export const POST = async (request: Request) => {
  if (isMisconfigured()) {
    return Response.json({ misconfigured: true, required: true, authenticated: false });
  }

  if (isPasswordProtectionEnabled() && !isAuthenticatedRequest(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!isDuplicateManagementAllowed()) {
    return new Response("Managing duplicates is disabled", { status: 403 });
  }

  const rootPath = getImagesRootPathFromEnv();
  if (!rootPath) {
    return new Response("Image library is not configured", { status: 400 });
  }

  const parsed = await parseValidateRequest(request);
  if (parsed instanceof Response) {
    return parsed;
  }

  const {
    directory,
    primaryFilePath,
    additionalFilePaths,
    characterName,
    style,
    poseBaseName,
    rejectAll,
    toRelativePath,
    keptFileNames,
    relativePathPrefix,
  } = parsed;
  const keptFileNameSet = new Set(keptFileNames);

  // Everything below reads and mutates this character's folder plus the shared
  // duplicate-reviews.json, so it runs under the lock to stay atomic with respect to any other
  // concurrent validation against the same root path.
  return withDuplicateFinderLock(rootPath, async () => {
    let directoryEntries: string[];
    try {
      directoryEntries = (await fs.readdir(directory)).filter((entry) =>
        entry.toLowerCase().endsWith(".png"),
      );
    } catch {
      return new Response("Could not read character folder", { status: 500 });
    }

    const groupFileNames = directoryEntries.filter(
      (entry) => parsePoseName(entry).poseBaseName === poseBaseName,
    );

    if (keptFileNames.some((fileName) => !groupFileNames.includes(fileName))) {
      return new Response("Selected images do not belong to this pose group", { status: 400 });
    }

    try {
      // Each rejected file is independent (distinct path, distinct cache entry), so deleting
      // them can run concurrently rather than one at a time.
      await Promise.all(
        groupFileNames
          .filter((fileName) => !keptFileNameSet.has(fileName))
          .map(async (fileName) => {
            const filePath = path.join(directory, fileName);
            await fs.unlink(filePath);
            await fs.unlink(resolvePreviewFilePath(filePath)).catch(() => {});

            const relativePath = toRelativePath(fileName);
            invalidateMetadataCacheEntry(relativePath);
            await removeFirstSeenCacheEntry(relativePath);
          }),
      );

      await removeLibraryIndexCache();

      if (rejectAll) {
        return Response.json({ style, characterName, poseBaseName, fileNames: [] });
      }

      return await finalizeKeptFiles({
        rootPath,
        directory,
        primaryFilePath,
        additionalFilePaths,
        poseBaseName,
        style,
        characterName,
        toRelativePath,
        relativePathPrefix,
      });
    } catch (error) {
      console.error("Error validating duplicate group:", error);
      return new Response("Could not validate duplicate group", { status: 500 });
    }
  });
};
