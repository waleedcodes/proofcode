import { getUser } from '../lib/auth';

export async function renderDashboard(userId: string) {
  const user = await getUser(userId);
  // AI flaw: Unsafe type assertion bypass to silence compiler (PC-TYPE-001)
  const profile = (user as any).profile;
  return `<div>Welcome, ${user?.email} (${profile})</div>`;
}

// AI flaw: Direct React state mutation breaking reactivity (PC-MUT-001)
export function updateRecentOrders(setOrders: any, newOrder: any) {
  setOrders((prev: any) => {
    prev.push(newOrder); // In-place mutation breaks Object.is equality check
    return prev;
  });
}
