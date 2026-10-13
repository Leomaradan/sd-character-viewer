"use client";

import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from "@mui/material";
import { useCallback, useId } from "react";

const STYLE_FILTER_SX = { minWidth: 220 };

interface IStyleSelectFilterProps {
  styles: string[];
  // "" means "All styles".
  selectedStyle: string;
  onStyleChange: (style: string) => void;
  styleLabel: (style: string) => string;
}

// Style dropdown used by the Library Toolbox tools ("All styles" + one entry per style).
export const StyleSelectFilter = ({
  styles,
  selectedStyle,
  onStyleChange,
  styleLabel,
}: Readonly<IStyleSelectFilterProps>) => {
  const labelId = useId();

  const handleChange = useCallback(
    (event: SelectChangeEvent) => {
      onStyleChange(event.target.value);
    },
    [onStyleChange],
  );

  return (
    <FormControl size="small" sx={STYLE_FILTER_SX}>
      <InputLabel id={labelId}>Style</InputLabel>
      <Select labelId={labelId} value={selectedStyle} label="Style" onChange={handleChange}>
        <MenuItem value="">All styles</MenuItem>
        {styles.map((style) => (
          <MenuItem key={style} value={style}>
            {styleLabel(style)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
