"use client";

import { Card, CardContent, Typography } from "@mui/material";

export function HeroCard() {
  return (
    <Card
      sx={{
        borderRadius: 4,
        mb: 2,
        background:
          "radial-gradient(circle at 20% 10%, rgba(31,111,235,0.28), transparent 40%), radial-gradient(circle at 80% 90%, rgba(249,115,22,0.18), transparent 45%), linear-gradient(135deg, #0f172a, #172554)",
        color: "#f8fafc",
      }}
    >
      <CardContent>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Stable Diffusion Character Viewer
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.88, mt: 1 }}>
          Browse characters, styles, and poses from your mounted image library.
        </Typography>
      </CardContent>
    </Card>
  );
}
