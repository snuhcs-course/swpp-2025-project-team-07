export function getUserInitials(username?: string, email?: string): string {
  if (username) {
    return username[0].toUpperCase();
  }

  if (email) {
    return email[0].toUpperCase();
  }

  return 'U';
}
