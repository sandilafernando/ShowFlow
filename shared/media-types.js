import path from 'node:path';

export const MEDIA_EXTENSIONS = Object.freeze({
  video: ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.mpeg', '.mpg'],
  audio: ['.mp3', '.wav', '.aac', '.m4a', '.flac', '.ogg', '.opus', '.wma'],
  image: ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif'],
  presentation: ['.pptx', '.ppt', '.pptm', '.odp', '.key', '.ppsx'],
  document: ['.pdf', '.docx', '.doc', '.odt', '.txt', '.rtf', '.xlsx', '.csv'],
  other: [],
});

export const ALL_MEDIA_EXTENSIONS = Object.freeze(
  Object.values(MEDIA_EXTENSIONS).flat().filter(Boolean),
);

const EXTENSION_KIND = new Map(
  Object.entries(MEDIA_EXTENSIONS).flatMap(([kind, extensions]) =>
    extensions.map((extension) => [extension, kind]),
  ),
);

export function mediaKindForPath(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  return EXTENSION_KIND.get(extension) || 'other';
}

export function isSupportedMediaPath(filePath) {
  const extension = path.extname(String(filePath || '')).toLowerCase();
  return ALL_MEDIA_EXTENSIONS.includes(extension);
}

export function isProbeableKind(kind) {
  return kind === 'video' || kind === 'audio' || kind === 'image';
}

export function isImageKind(kind) {
  return kind === 'image';
}

export function isPresentationalKind(kind) {
  return kind === 'presentation' || kind === 'image';
}
