"use client";

import {
  Box,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import type { IMetadataFilterOption } from "@/types/library";

const FILTER_TITLE_SX = { color: "text.secondary", fontWeight: 700, mb: 1 };
const FILTER_INPUT_ROW_SX = { display: "flex", alignItems: "center", gap: 1 };
const FILTER_DROPDOWN_SX = { minWidth: 280, maxWidth: 420 };

interface ICategoryFilterProps {
  metadataFilterOptions: IMetadataFilterOption[];
  selectedMetadataFilterId: string;
  onMetadataFilterChange: (event: SelectChangeEvent<string>) => void;
  onClearMetadataFilter: () => void;
  prefix: string;
}

export const CategoryFilter: React.FC<ICategoryFilterProps> = ({
  selectedMetadataFilterId,
  onMetadataFilterChange,
  metadataFilterOptions,
  onClearMetadataFilter,
  prefix,
}) => {
  if (metadataFilterOptions.length === 0) {
    return null;
  }

  return (
    <Box>
      <Typography variant="subtitle2" sx={FILTER_TITLE_SX}>
        Category & Serie Filters
      </Typography>
      <Box sx={FILTER_INPUT_ROW_SX}>
        <FormControl size="small" sx={FILTER_DROPDOWN_SX}>
          <InputLabel id={`${prefix}-metadata-filter-label`}>Filter</InputLabel>
          <Select
            labelId={`${prefix}-metadata-filter-label`}
            value={selectedMetadataFilterId}
            label="Filter"
            onChange={onMetadataFilterChange}
          >
            <MenuItem value="">All</MenuItem>
            {metadataFilterOptions.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton
          aria-label="Clear metadata filter"
          size="small"
          onClick={onClearMetadataFilter}
          disabled={selectedMetadataFilterId === ""}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
};
