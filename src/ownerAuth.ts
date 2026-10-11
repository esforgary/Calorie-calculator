// Public account identifiers only. The password is supplied at login and is never bundled.
export const OWNER_LOGIN = 'esforgary';
export const OWNER_AUTH_EMAIL = 'esforgary@kall.invalid';

export function resolveOwnerEmail(login: string): string {
  if (login.trim().toLowerCase() !== OWNER_LOGIN) throw new Error('Неверный логин или пароль.');
  return OWNER_AUTH_EMAIL;
}

export function isOwnerEmail(email: string | undefined): boolean {
  return email?.trim().toLowerCase() === OWNER_AUTH_EMAIL;
}
