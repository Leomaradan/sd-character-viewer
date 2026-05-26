"use client";

import { Card, CardContent, Typography } from "@mui/material";
import { BORDER_STYLE_DASHED, MARGIN_TOP_1 } from "./constants";

interface IEmptyStateProps {
  title: string;
  description: string;
}

export const EmptyState = ({ title, description }: Readonly<IEmptyStateProps>) => {
  return (
    <Card variant="outlined" sx={BORDER_STYLE_DASHED}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={MARGIN_TOP_1}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
};
