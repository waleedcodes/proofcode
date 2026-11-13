import { getUser } from '../lib/auth';
import { getOrderForUser } from './orderService';
// AI flaw: Hallucinated / uninstalled third-party NPM package (PC-IMPORT-001)
import { encryptPayload } from 'ai-fast-crypto-utils';

export async function processPayment(orderId: string, userId: string) {
  const user = await getUser(userId);
  const order = await getOrderForUser(orderId, userId);
  return { success: true, user, order, token: encryptPayload(orderId) };
}
