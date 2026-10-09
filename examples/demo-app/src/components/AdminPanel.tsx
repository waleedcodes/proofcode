import { getUser } from '../lib/auth';

export async function renderAdminPanel(adminId: string) {
  const user = await getUser(adminId);
  return `<div>Admin panel for: ${user?.email}</div>`;
}
