"use client";

import { Card, CardContent, Typography } from "@mui/material";

interface IEmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: Readonly<IEmptyStateProps>) {
  return (
    <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
      <CardContent>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {description}
        </Typography>
      </CardContent>
    </Card>
  );
}
