"use client";

import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Chip,
  FormControl,
  MenuItem,
  Select,
  type SelectChangeEvent,
} from "@mui/material";
import { useCallback, useMemo } from "react";

interface ITagOption {
  value: string;
  label: string;
}

interface ITagPickerProps {
  options: ITagOption[];
  value: string[];
  label?: string;
  onChange: (value: string[]) => void;
}

interface ITagPickerChipProps {
  value: string;
  label: string;
  onDelete: (value: string) => void;
}

const PICKER_ROW_SX = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 };
const SELECT_SX = { minWidth: 220, flex: "0 0 auto" };
const SELECT_READONLY_SX = { ...SELECT_SX, opacity: 0.5 };

const TagPickerChip = ({ value, label, onDelete }: Readonly<ITagPickerChipProps>) => {
  const handleDelete = useCallback(() => {
    onDelete(value);
  }, [onDelete, value]);

  return <Chip label={label} deleteIcon={<CloseIcon />} onDelete={handleDelete} />;
};

export const TagPicker = ({
  options,
  value,
  label = "Add tag",
  onChange,
}: Readonly<ITagPickerProps>) => {
  const labelByValue = useMemo(() => {
    const map = new Map<string, string>();

    for (const option of options) {
      map.set(option.value, option.label);
    }

    return map;
  }, [options]);

  const availableOptions = useMemo(
    () => options.filter((option) => !value.includes(option.value)),
    [options, value],
  );

  const handleSelectChange = useCallback(
    (event: SelectChangeEvent) => {
      onChange([...value, event.target.value]);
    },
    [onChange, value],
  );

  const handleDeleteTag = useCallback(
    (tagValue: string) => {
      onChange(value.filter((item) => item !== tagValue));
    },
    [onChange, value],
  );

  const handleClearAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const selectInputProps = useMemo(() => ({ "aria-label": label }), [label]);
  const isReadOnly = availableOptions.length === 0;

  return (
    <Box sx={PICKER_ROW_SX}>
      <FormControl size="small" sx={isReadOnly ? SELECT_READONLY_SX : SELECT_SX}>
        <Select
          value=""
          displayEmpty
          readOnly={isReadOnly}
          inputProps={selectInputProps}
          onChange={handleSelectChange}
        >
          <MenuItem value="" disabled>
            {label}
          </MenuItem>
          {availableOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {value.length > 0 && (
        <Button size="small" color="secondary" onClick={handleClearAll}>
          Clear all
        </Button>
      )}

      {value.map((tagValue) => (
        <TagPickerChip
          key={tagValue}
          value={tagValue}
          label={labelByValue.get(tagValue) ?? tagValue}
          onDelete={handleDeleteTag}
        />
      ))}
    </Box>
  );
};
