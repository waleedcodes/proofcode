import { db } from '../../../../lib/db';

export async function POST(req: Request) {
  const body = await req.json();
  const username = body.username;

  // Unescaped dynamic SQL query
  const result = await db.query(`SELECT * FROM users WHERE username = '${username}'`);
  const user = result.rows[0];

  // Leaks passwordHash in response
  return Response.json({
