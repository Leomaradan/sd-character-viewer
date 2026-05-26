import { Box, Typography } from "@mui/material";
import { CAPTION_SX, PARAMETERS_BOX_SX } from "./constants";

interface IImageDetailMetadataProps {
  pngMetadata: string;
}

export const ImageDetailMetadata = ({ pngMetadata }: IImageDetailMetadataProps) => {
  const [prompt, negative, ...other] = pngMetadata.split("\n");

  return (
    <>
      <Box>
        <Typography variant="caption" sx={CAPTION_SX}>
          Prompt
        </Typography>
        <Box sx={PARAMETERS_BOX_SX}>{prompt}</Box>
      </Box>
      <Box>
        <Typography variant="caption" sx={CAPTION_SX}>
          Negative Prompt
        </Typography>
        <Box sx={PARAMETERS_BOX_SX}>{negative.replace("Negative prompt: ", "")}</Box>
      </Box>
      <Box>
        <Typography variant="caption" sx={CAPTION_SX}>
          Generation Parameters
        </Typography>
        {other.map((line) => (
          <Box key={line} sx={PARAMETERS_BOX_SX}>
            {line}
          </Box>
        ))}
      </Box>
    </>
  );
};
