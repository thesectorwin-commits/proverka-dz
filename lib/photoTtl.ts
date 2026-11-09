// Единая точка правды про срок хранения фото решения (48 часов) —
// см. CLAUDE.md, раздел про хранение фото. Используется и на сервере
// (проверка перед отдачей файла), и при формировании списка проверок
// (чтобы не показывать превью, если фото уже должно было быть удалено).

export const PHOTO_TTL_HOURS = 48;

export function isPhotoStillAvailable(photoPath: string | null | undefined, createdAt: string): boolean {
  if (!photoPath) return false;
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  return ageHours <= PHOTO_TTL_HOURS;
}
