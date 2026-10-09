import { getUser } from '../lib/auth';
import { getOrderForUser } from './orderService';

export async function processPayment(orderId: string, userId: string) {
  const user = await getUser(userId);
  const order = await getOrderForUser(orderId, userId);
  return { success: true, user, order };
}
