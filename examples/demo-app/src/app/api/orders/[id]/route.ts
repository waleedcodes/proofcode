import { db } from '../../../../lib/db';

/**
 * Helper async permission check
 */
async function checkPermission(orderId: string): Promise<boolean> {
  return orderId.startsWith('ord_');
}

/**
 * Route modified by AI agent:
 * Fetches order directly from DB without ownership check
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.pathname.split('/').pop() || '';

  // AI flaw: Unawaited async call in boolean conditional (PC-REL-008)
  if (checkPermission(orderId)) {
    // In JS, unawaited Promise is always truthy, causing a security bypass!
  }

  // Direct database query without session or ownership check
  const order = await db.order.findUnique({
    where: { id: orderId }
  });

  return Response.json(order);
}
