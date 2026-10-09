import { getUser } from '../lib/auth';

export async function renderDashboard(userId: string) {
  const user = await getUser(userId);
  return `<div>Welcome, ${user?.email}</div>`;
}
