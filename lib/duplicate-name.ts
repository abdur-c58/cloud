function splitFileName(name: string): { stem: string; ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return { stem: name, ext: "" };
  return { stem: name.slice(0, idx), ext: name.slice(idx) };
}

/** Picks "name (2).ext" when `name` already exists in the folder. */
export function nextDuplicateName(name: string, existing: Set<string>, isFolder = false): string {
  if (!existing.has(name)) return name;

  const { stem, ext } = isFolder ? { stem: name, ext: "" } : splitFileName(name);
  const baseStem = stem.replace(/ \(\d+\)$/, "");

  for (let n = 2; n < 10_000; n++) {
    const candidate = `${baseStem} (${n})${ext}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${baseStem} (${Date.now()})${ext}`;
}
