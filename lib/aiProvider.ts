import { supabaseServer } from '@/lib/supabaseServer';

// Переключатель провайдера проверки, редактируемый из админки (см.
// app/api/admin/ai-provider/, components/AdminAiProvider.tsx) — тот же
// паттерн "ключ-значение в БД, дефолт из кода", что уже используется для
// push_templates (lib/pushTemplates.ts). Пока админ ничего не менял,
// используется текущий провайдер (Claude) — поведение не меняется, пока
// эксперимент не включён явно.

export const AI_PROVIDER_DEFAULT = 'claude' as const;
export type AiProvider = 'claude' | 'openai';

export async function getAiProvider(): Promise<AiProvider> {
  const { data } = await supabaseServer
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_provider')
    .maybeSingle();

  return data?.value === 'openai' ? 'openai' : AI_PROVIDER_DEFAULT;
}

// 20.08.2026: тот же паттерн — тумблер пилота "индекс учебника"
// (см. lib/textbookIndex.ts, lib/openai.ts → tryTextbookIndexCheck).
// Дефолт "выключено" — пока админ явно не включил, проверка идёт по
// обычному пути (Claude/OpenAI), поведение не меняется.
export async function getTextbookIndexEnabled(): Promise<boolean> {
  const { data } = await supabaseServer
    .from('app_settings')
    .select('value')
    .eq('key', 'textbook_index_enabled')
    .maybeSingle();

  return data?.value === 'true';
}
