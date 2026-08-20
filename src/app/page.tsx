import { connection } from "next/server";
import { Suspense } from "react";

import { ImageViewerApp } from "@/components/ImageViewerApp";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";
import { SD_ALLOW_DELETE_ENV_KEY } from "@/lib/env-keys";

import packageJson from "../../package.json";

const Home = async () => {
  await connection();
  ensureLocalEnvLoaded();

  const canDeleteImage = readBooleanEnvFlag(process.env[SD_ALLOW_DELETE_ENV_KEY]);

  return (
    <Suspense>
      <ImageViewerApp canDeleteImage={canDeleteImage} appVersion={packageJson.version} />
    </Suspense>
  );
};

export default Home;
