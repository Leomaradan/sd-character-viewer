import { InputAdornment, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useCallback } from "react";

interface ISearchFieldProps {
  onClear: (value: string) => void;
  label: string;
}

export const SearchField = ({ onClear, label }: Readonly<ISearchFieldProps>) => {
  const handleClearSearch = useCallback(() => {
    onClear("");
  }, [onClear]);

  return (
    <InputAdornment position="end">
      <IconButton
        edge="end"
        size="small"
        aria-label={`Clear ${label} search`}
        onClick={handleClearSearch}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </InputAdornment>
  );
};
