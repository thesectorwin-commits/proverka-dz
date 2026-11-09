import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

// Отдельная авторизация админки по логину/паролю — не связана с обычной
// системой пользователей (Яндекс ID). Пароль нигде не хранится в открытом
// виде, только его соль+хеш в ADMIN_PASSWORD_HASH.

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;

  const hash = scryptSync(password, salt, 64);
  const storedHash = Buffer.from(hashHex, 'hex');
  if (hash.length !== storedHash.length) return false;

  return timingSafeEqual(hash, storedHash);
}
