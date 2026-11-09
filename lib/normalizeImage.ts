// Перекодирует любое загруженное фото в JPEG через canvas перед отправкой
// на сервер — независимо от исходного формата. Главная причина: iOS по
// умолчанию снимает камерой в HEIC, а Claude API принимает только
// jpeg/png/gif/webp — без этой перекодировки такие фото падали с сырой
// ошибкой валидации от Anthropic API прямо в интерфейсе родителя.
// Декодирование делает сам браузер (createImageBitmap), это работает и
// для HEIC на Safari/iOS, где такая поддержка встроена в ОС. Заодно
// нормализует EXIF-ориентацию и слегка уменьшает крупные фото.

const MAX_DIMENSION = 2000;

// 02.09.2026: createDetailCrops()/encodeCrop() (клиентская canvas-версия
// верх/низ с нахлёстом) удалены — раздел "Проверить" теперь всегда просит
// пользователя выделить область вручную (см. components/CropSelector.tsx,
// CLAUDE.md → «Выделение области задания при проверке»), и детализация
// считается СЕРВЕРОМ от уже обрезанной области (lib/claude.ts →
// createDetailCropsFromImage), а не от всей страницы целиком на клиенте —
// иначе кропы принесли бы в кадр соседние задания, которые пользователь
// как раз исключил выделением. Больше никто не вызывал эту функцию.

export async function normalizeImageToJpeg(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // Браузер не смог декодировать/перекодировать — отправляем оригинал
    // как есть, попытка лучше, чем вообще ничего не отправить.
    return file;
  }
}
