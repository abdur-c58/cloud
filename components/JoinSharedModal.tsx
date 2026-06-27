"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "./Modal";

export function JoinSharedModal({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      await api.joinShared(trimmed);
      setCode("");
      onJoined();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join folder");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join shared folder"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !code.trim()}>
            {loading ? <span className="spinner h-4 w-4" /> : "Join"}
          </button>
        </>
      }
    >
      <Label className="mb-1.5 block text-sm text-muted-foreground">Enter the join code from the folder owner</Label>
      <Input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD1234"
        className="font-mono tracking-widest uppercase"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {error && (
        <p className="mt-3 rounded-[var(--radius)] border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
    </Modal>
  );
}
