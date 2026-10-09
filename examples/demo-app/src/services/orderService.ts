import { getUser } from '../lib/auth';
import { db } from '../lib/db';

export async function getOrderForUser(orderId: string, userId: string) {
  const user = await getUser(userId);
  if (!user) throw new Error('User not found');
