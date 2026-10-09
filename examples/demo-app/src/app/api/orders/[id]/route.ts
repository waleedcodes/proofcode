import { db } from '../../../../lib/db';

/**
 * Route modified by AI agent:
 * Fetches order directly from DB without ownership check
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.pathname.split('/').pop() || '';

  // Direct database query without session or ownership check
  const order = await db.order.findUnique({
