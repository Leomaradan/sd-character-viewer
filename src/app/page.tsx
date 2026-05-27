import { Suspense } from "react";
import { ImageViewerApp } from "@/components/ImageViewerApp";
import { ensureLocalEnvLoaded, readBooleanEnvFlag } from "@/lib/env";

const DELETE_ENV_KEY = "SD_ALLOW_DELETE";

const Home = () => {
  ensureLocalEnvLoaded();

  const canDeleteImage = readBooleanEnvFlag(process.env[DELETE_ENV_KEY]);

  return (
    <Suspense>
      <ImageViewerApp canDeleteImage={canDeleteImage} />
    </Suspense>
  );
};

export default Home;
