"use client";

import { Icon } from "./Icons";

export interface UploadJob {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
}

export function UploadTray({
  jobs,
  onClear,
}: {
  jobs: UploadJob[];
  onClear: () => void;
}) {
  if (jobs.length === 0) return null;
  const active = jobs.filter((j) => j.status === "uploading").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const allDone = active === 0;
  const title =
    !allDone
      ? `Uploading ${active} item${active > 1 ? "s" : ""}…`
      : failed > 0
        ? `${failed} upload${failed > 1 ? "s" : ""} failed`
        : "Uploads complete";

  return (
    <div className="card fixed bottom-4 left-4 z-[80] w-[min(92vw,340px)] overflow-hidden p-0  animate-slide-up safe-pb">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <p className="text-sm font-semibold">{title}</p>
        {allDone && (
          <button onClick={onClear} className="btn-ghost rounded-md p-1" aria-label="Clear">
            <Icon.X size={16} />
          </button>
        )}
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <span className="shrink-0 text-muted-foreground">
              {job.status === "done" ? (
                <Icon.Check size={16} className="text-[var(--success)]" />
              ) : job.status === "error" ? (
                <Icon.X size={16} className="text-[var(--danger)]" />
              ) : (
                <span className="spinner h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--foreground)]">{job.name}</p>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-full transition-all duration-200"
                  style={{
                    width: `${job.progress}%`,
                    background: job.status === "error" ? "var(--danger)" : "var(--accent)",
                  }}
                />
              </div>
              {job.error && <p className="mt-0.5 text-[10px] text-[var(--danger)]">{job.error}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
