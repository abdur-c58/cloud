export const DND_MIME = "application/x-gcc-item";

export type ItemScope = "personal" | "shared";

export type DragItemPayload = {
  key: string;
  name: string;
  type: string;
  scope: ItemScope;
  shareId?: string;
};

export type DropDestination = {
  prefix: string;
  scope: ItemScope;
  shareId?: string;
};

export function parseDragPayload(data: string): DragItemPayload | null {
  try {
    const parsed = JSON.parse(data) as DragItemPayload;
    if (!parsed?.key || !parsed.scope) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parentPrefix(key: string): string {
  if (key.endsWith("/")) return key.replace(/[^/]+\/$/, "");
  return key.replace(/[^/]+$/, "");
}

export function normalizeFolderPrefix(prefix: string): string {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

export function canDropItem(source: DragItemPayload, dest: DropDestination): boolean {
  const destPrefix = normalizeFolderPrefix(dest.prefix);

  if (source.scope === "shared" && dest.scope === "personal") return false;
  if (source.scope === "shared" && dest.scope === "shared" && source.shareId !== dest.shareId) {
    return false;
  }

  const srcParent = parentPrefix(source.key);
  const sameScope =
    source.scope === dest.scope &&
    (source.scope !== "shared" || source.shareId === dest.shareId);
  if (sameScope && destPrefix === srcParent) return false;

  if (source.type === "folder" && source.key.endsWith("/")) {
    if (destPrefix === source.key || destPrefix.startsWith(source.key)) return false;
  }

  return true;
}

export function getDropLabel(source: DragItemPayload, dest: DropDestination): string {
  if (dest.scope === "shared" && source.scope === "personal") return "Copy to here";
  return "Move here";
}

export function isInternalDrag(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(DND_MIME);
}
