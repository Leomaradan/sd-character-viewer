import { Box, Typography } from "@mui/material";
import React, { useMemo } from "react";

import { CAPTION_SX, PARAMETERS_BOX_SX } from "../common/constants";

interface IImageDetailMetadataProps {
  pngMetadata: string;
}

/**
 * Splits `input` on `delimiter`, ignoring any delimiter found inside double-quoted
 * substrings so quoted blocks (e.g. `ControlNet 0: "Module: None, Weight: 1"`) stay intact.
 */
const splitTopLevel = (input: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of input) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);

  return result;
};

const splitParam = (param: string): [string, string] => {
  const trimmed = param.trim();
  const colonIndex = trimmed.indexOf(":");

  if (colonIndex === -1) {
    return [trimmed, ""];
  }

  const title = trimmed.slice(0, colonIndex).trim();
  let value = trimmed.slice(colonIndex + 1).trim();

  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  return [title, value];
};

const splitMetadata = (pngMetadata: string) => {
  const parts = pngMetadata.split("\n");

  const [prompt, ...rest] = parts;
  let [negative = "", ...other] = rest;

  if (!negative.startsWith("Negative prompt: ")) {
    other = [negative, ...other];
    negative = "Negative prompt: ";
  }

  const generationParameters: [string, string][] = splitTopLevel(other.join("\n"), ",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => splitParam(part));

  return { prompt, negative, generationParameters };
};

export const ImageDetailMetadata = ({ pngMetadata }: IImageDetailMetadataProps) => {
  const { prompt, negative, generationParameters } = useMemo(
    () => splitMetadata(pngMetadata),
    [pngMetadata],
  );

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
        {generationParameters.map(([title, value]) => (
          <React.Fragment key={title + value}>
            <Typography variant="caption" sx={CAPTION_SX}>
              {title}
            </Typography>
            <Box sx={PARAMETERS_BOX_SX}>{value}</Box>
          </React.Fragment>
        ))}
      </Box>
    </>
  );
};
