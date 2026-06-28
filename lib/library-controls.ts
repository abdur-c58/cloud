import type { ItemType, StorageItem } from "@/lib/types";

export type SortKey =
  | "name-asc"
  | "name-desc"
  | "date-desc"
  | "date-asc"
  | "size-desc"
  | "size-asc"
  | "type-asc"
  | "type-desc";

export type TypeFilter = "all" | ItemType;

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name-asc", label: "Name A–Z" },
  { value: "name-desc", label: "Name Z–A" },
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "size-desc", label: "Largest first" },
  { value: "size-asc", label: "Smallest first" },
  { value: "type-asc", label: "Type A–Z" },
  { value: "type-desc", label: "Type Z–A" },
];

export const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "folder", label: "Folders" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "other", label: "Other files" },
];

const LEGACY_SORT: Record<string, SortKey> = {
  name: "name-asc",
  date: "date-desc",
  size: "size-desc",
};

export function parseStoredSort(raw: string | null): SortKey | null {
  if (!raw) return null;
  const key = (LEGACY_SORT[raw] ?? raw) as SortKey;
  return SORT_OPTIONS.some((o) => o.value === key) ? key : null;
}

export function parseStoredTypeFilter(raw: string | null): TypeFilter | null {
  if (!raw) return null;
  return TYPE_FILTER_OPTIONS.some((o) => o.value === raw) ? (raw as TypeFilter) : null;
}

function dateMs(item: StorageItem): number {
  return item.last_modified ? Date.parse(item.last_modified) : 0;
}

export function sortStorageItems(items: StorageItem[], sort: SortKey): StorageItem[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "name-desc":
        return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
      case "date-desc":
        return dateMs(b) - dateMs(a);
      case "date-asc":
        return dateMs(a) - dateMs(b);
      case "size-desc":
        return (b.size ?? 0) - (a.size ?? 0);
      case "size-asc":
        return (a.size ?? 0) - (b.size ?? 0);
      case "type-asc":
        return a.type.localeCompare(b.type) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "type-desc":
        return b.type.localeCompare(a.type) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      default:
        return 0;
    }
  });
  return sorted;
}

export function applyTypeFilter(
  folders: StorageItem[],
  files: StorageItem[],
  filter: TypeFilter,
): { folders: StorageItem[]; files: StorageItem[] } {
  switch (filter) {
    case "all":
      return { folders, files };
    case "folder":
      return { folders, files: [] };
    default:
      return { folders: [], files: files.filter((f) => f.type === filter) };
  }
}
