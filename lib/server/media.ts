const IMAGE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif",
  ".heic", ".heif", ".avif", ".svg", ".ico",
]);

const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".webm", ".mov", ".avi", ".mkv", ".m4v", ".wmv", ".flv",
  ".mpeg", ".mpg", ".3gp", ".ts", ".ogv",
]);

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".wma",
  ".opus", ".aiff", ".alac",
]);

export const MEDIA_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp",
  ".tiff": "image/tiff", ".tif": "image/tiff", ".heic": "image/heic",
  ".heif": "image/heif", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime",
  ".avi": "video/x-msvideo", ".mkv": "video/x-matroska", ".m4v": "video/x-m4v",
  ".wmv": "video/x-ms-wmv", ".flv": "video/x-flv", ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg", ".3gp": "video/3gpp", ".ts": "video/mp2t", ".ogv": "video/ogg",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg",
  ".flac": "audio/flac", ".wma": "audio/x-ms-wma", ".opus": "audio/opus",
  ".aiff": "audio/aiff", ".alac": "audio/m4a",
};

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function classify(name: string): string {
  if (name.endsWith("/")) return "folder";
  const ext = extOf(name);
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "other";
}

export function contentTypeFor(name: string): string {
  return CONTENT_TYPES[extOf(name)] || "application/octet-stream";
}

export function isMedia(name: string): boolean {
  return MEDIA_EXTENSIONS.has(extOf(name));
}
