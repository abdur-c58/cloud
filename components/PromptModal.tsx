"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "./Modal";

export function PromptModal({
  open,
  title,
  label,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(value.trim())} disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {label && (
        <Label className="mb-1.5 block text-sm font-medium text-muted-foreground">{label}</Label>
      )}
      <Input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
        }}
      />
    </Modal>
  );
}
