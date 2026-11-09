import { supabaseServer } from '@/lib/supabaseServer';

// Тексты автоматических push-уведомлений, редактируемые из админки
// (см. app/api/admin/push-templates/, components/AdminPushTemplates.tsx).
// Пока текст не переопределён администратором в таблице push_templates,
// используются значения по умолчанию отсюда — так поведение не меняется,
// пока никто ничего не настроил.

export const PUSH_TEMPLATE_DEFAULTS = {
  check_ready: {
    title: 'Проверка готова',
    body: '{subject}: {grade}'
  },
  reminder: {
    title: 'Пора делать уроки 📚',
    body: 'Не забудь сделать домашнее задание и сфотографировать его для проверки.'
  }
} as const;

export type PushTemplateKey = keyof typeof PUSH_TEMPLATE_DEFAULTS;
export const PUSH_TEMPLATE_KEYS = Object.keys(PUSH_TEMPLATE_DEFAULTS) as PushTemplateKey[];

export async function getPushTemplate(key: PushTemplateKey): Promise<{ title: string; body: string }> {
  const { data } = await supabaseServer.from('push_templates').select('title, body').eq('key', key).maybeSingle();

  return {
    title: data?.title || PUSH_TEMPLATE_DEFAULTS[key].title,
    body: data?.body || PUSH_TEMPLATE_DEFAULTS[key].body
  };
}

// Подстановка {placeholder} в текст шаблона. Неизвестные плейсхолдеры
// оставляем как есть — чтобы опечатка в фигурных скобках была видна
// в самом уведомлении, а не тихо исчезала.
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
