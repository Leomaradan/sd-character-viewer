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
  isDuplicateGroupReviewed,
  parsePoseName,
  readImageLibrary,
  readReviewedDuplicateGroups,
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
  const groups = findDuplicateGroups(library.images).filter(
    (group) => !isDuplicateGroupReviewed(group, reviewedGroups),
  );

  return Response.json({ groups });
};

interface IValidateRequestBody {
  primaryRelativePath?: unknown;
  additionalKeptRelativePaths?: unknown;
}

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

  let body: IValidateRequestBody;
  try {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    body = (await request.json()) as IValidateRequestBody;
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const primaryRelativePath =
    typeof body.primaryRelativePath === "string" ? body.primaryRelativePath : "";
  const rawAdditionalPaths = body.additionalKeptRelativePaths;

  if (
    !primaryRelativePath ||
    !Array.isArray(rawAdditionalPaths) ||
    rawAdditionalPaths.some((value) => typeof value !== "string")
  ) {
    return new Response("Invalid request body", { status: 400 });
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const additionalRelativePaths = [...new Set(rawAdditionalPaths as string[])].filter(
    (relativePath) => relativePath !== primaryRelativePath,
  );

  const isCharacterImagePath = (value: string): boolean =>
    value.replaceAll("\\", "/").startsWith("characters/");
  if (
    !isCharacterImagePath(primaryRelativePath) ||
    additionalRelativePaths.some((relativePath) => !isCharacterImagePath(relativePath))
  ) {
    return new Response("Invalid image path", { status: 400 });
  }

  const primaryFilePath = resolveImageFilePath(primaryRelativePath);
  if (!primaryFilePath) {
    return new Response("Invalid image path", { status: 400 });
  }

  const additionalFilePaths: string[] = [];
  for (const relativePath of additionalRelativePaths) {
    const filePath = resolveImageFilePath(relativePath);
    if (!filePath) {
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

  const toRelativePath = (fileName: string): string =>
    path.posix.join("characters", style, characterName, fileName);

  const keptFileNames = [
    path.basename(primaryFilePath),
    ...additionalFilePaths.map((filePath) => path.basename(filePath)),
  ];
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
      for (const fileName of groupFileNames) {
        if (keptFileNameSet.has(fileName)) {
          continue;
        }

        const filePath = path.join(directory, fileName);
        await fs.unlink(filePath);
        await fs.unlink(resolvePreviewFilePath(filePath)).catch(() => {});

        const relativePath = toRelativePath(fileName);
        invalidateMetadataCacheEntry(relativePath);
        await removeFirstSeenCacheEntry(relativePath);
      }

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

      const tempRenames: Array<{
        tempFileName: string;
        targetFileName: string;
        oldRelativePath: string;
      }> = [];

      for (const entry of pendingRenames) {
        const tempFileName = `.duplicate-finder-tmp-${randomUUID()}.png`;
        const currentFilePath = path.join(directory, entry.currentFileName);
        const tempFilePath = path.join(directory, tempFileName);

        await fs.rename(currentFilePath, tempFilePath);
        await fs
          .rename(resolvePreviewFilePath(currentFilePath), resolvePreviewFilePath(tempFilePath))
          .catch(() => {});

        tempRenames.push({
          tempFileName,
          targetFileName: entry.targetFileName,
          oldRelativePath: toRelativePath(entry.currentFileName),
        });
      }

      for (const { tempFileName, targetFileName, oldRelativePath } of tempRenames) {
        const tempFilePath = path.join(directory, tempFileName);
        const targetFilePath = path.join(directory, targetFileName);

        await fs.rename(tempFilePath, targetFilePath);
        await fs
          .rename(resolvePreviewFilePath(tempFilePath), resolvePreviewFilePath(targetFilePath))
          .catch(() => {});

        invalidateMetadataCacheEntry(oldRelativePath);
        invalidateMetadataCacheEntry(toRelativePath(targetFileName));
        await removeFirstSeenCacheEntry(oldRelativePath);
      }

      const finalFileNames = renamePlan
        .map((entry) => entry.targetFileName)
        .toSorted((a, b) => a.localeCompare(b));

      const reviewedGroups = await readReviewedDuplicateGroups(rootPath);
      const remainingReviewedGroups = reviewedGroups.filter(
        (reviewedGroup) =>
          !(
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
      };

      await writeReviewedDuplicateGroups(rootPath, [...remainingReviewedGroups, newReviewedGroup]);

      return Response.json({ style, characterName, poseBaseName, fileNames: finalFileNames });
    } catch {
      return new Response("Could not validate duplicate group", { status: 500 });
    }
  });
};
