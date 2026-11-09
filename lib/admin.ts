import { getAdminSession } from '@/lib/adminSession';

/**
 * Проверка прав администратора — по отдельному логину/паролю
 * (ADMIN_USERNAME / ADMIN_PASSWORD_HASH в переменных окружения),
 * не связана с обычными пользователями и Яндекс ID.
 */
export async function requireAdmin(): Promise<boolean> {
  return getAdminSession();
}
