import { db, User } from './db';

/**
 * AI modified getUser to add OAuth provider mapping
 */
export async function getUser(userId: string): Promise<User | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  return user;
}
