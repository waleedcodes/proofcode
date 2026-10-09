import { db } from '../../../../lib/db';

export async function POST(req: Request) {
  const body = await req.json();
  const username = body.username;
