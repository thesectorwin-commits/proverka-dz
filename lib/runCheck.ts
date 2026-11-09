import { checkHomeworkPhoto, ImageInput } from '@/lib/claude';
import { checkHomeworkPhotoOpenAI, tryTextbookIndexCheck } from '@/lib/openai';
import { getTextbookIndexEnabled } from '@/lib/aiProvider';

// Вынесено из app/api/checks/route.ts (09.10.2026) — та же логика выбора
// провайдера (сначала индекс учебника, потом Claude/OpenAI) нужна и
// обычной проверке, и app/api/checks/demo/route.ts (живая демо-проверка
// на главной, components/DemoCheckSection.tsx). Дублировать её в двух
// местах было бы легко рассинхронизировать при следующей правке —
// см. комментарий у места вызова в app/api/checks/route.ts.
export async function runCheck(provider: 'claude' | 'openai', images: ImageInput[], detailCrops: ImageInput[]) {
  if (images.length === 1 && (await getTextbookIndexEnabled())) {
    const indexResult = await tryTextbookIndexCheck(images[0], detailCrops);
    if (indexResult) {
      return { ...indexResult, providerUsed: 'index' as const };
    }
  }

  const result = await (provider === 'openai'
    ? checkHomeworkPhotoOpenAI(images, detailCrops)
    : checkHomeworkPhoto(images, detailCrops));
  return { ...result, providerUsed: provider };
}
