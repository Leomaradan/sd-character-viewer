"use client";

import { Box, Card, CardActionArea, CardContent, Typography } from "@mui/material";
import { LazyImage } from "@/components/image-viewer/LazyImage";
import type { ICharacterSummary, TStyle } from "@/types/library";
import { useCallback, useMemo } from "react";

interface ICharacterViewProps {
  defaultStyle: TStyle;
  browseStyle: TStyle;

  character: ICharacterSummary;

  onSelectCharacter: (characterName: string | null) => void;
}

const CARD = {
  width: "100%",
  aspectRatio: "3 / 4",
  bgcolor: "grey.100",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const LAZY_IMAGE_SX = { width: "100%", height: "100%", objectFit: "cover" };

export const CharacterView = ({
  defaultStyle,
  browseStyle,
  character,
  onSelectCharacter,
}: Readonly<ICharacterViewProps>) => {
  const thumbnailPath = useMemo(() => {
    return (
      character.thumbnailsByStyle[browseStyle] ??
      character.thumbnailsByStyle[defaultStyle] ??
      Object.values(character.thumbnailsByStyle)[0]
    );
  }, [character, browseStyle, defaultStyle]);

  const handleOnClick = useCallback(() => {
    onSelectCharacter(character.name);
  }, [character.name, onSelectCharacter]);

  return (
    <Card key={character.name}>
      <CardActionArea onClick={handleOnClick}>
        <Box sx={CARD}>
          {thumbnailPath ? (
            <LazyImage
              relativePath={thumbnailPath}
              alt={`${character.name} base`}
              sx={LAZY_IMAGE_SX}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No Base image
            </Typography>
          )}
        </Box>
        <CardContent>
          <Typography variant="subtitle1" noWrap>
            {character.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {character.imageCount} images
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};
