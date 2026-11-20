import { describe, expect, it } from 'vitest';
import { RiskEngine } from '../src/rules/riskEngine';
import { AutoFixEngine } from '../src/fixer/autoFixEngine';

describe('Next.js App Router & Server Actions Security Engine', () => {
  describe('PC-ACTION-001: Unauthenticated Server Action with Mutation', () => {
    it('should flag an unauthenticated Server Action in a "use server" file performing database mutations', () => {
      const code = `'use server';

import { db } from '@/lib/db';

export async function deleteUserAccount(userId: string) {
  // Dangerous: No session or auth verification!
  await db.user.delete({
    where: { id: userId }
  });
  return { success: true };
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/user.ts', code);
      const actionFinding = findings.find((f) => f.ruleId === 'PC-ACTION-001');

      expect(actionFinding).toBeDefined();
      expect(actionFinding?.severity).toBe('HIGH');
      expect(actionFinding?.title).toContain('Unauthenticated Next.js Server Action');
      expect(actionFinding?.title).toContain('deleteUserAccount');
    });

    it('should NOT flag a Server Action that verifies authentication with auth()', () => {
      const code = `'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function deleteUserAccount(userId: string) {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  await db.user.delete({
    where: { id: userId }
  });
  return { success: true };
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/user.ts', code);
      const actionFinding = findings.find((f) => f.ruleId === 'PC-ACTION-001');

      expect(actionFinding).toBeUndefined();
    });

    it('should flag an inline "use server" action inside a component', () => {
      const code = `import { prisma } from '@/lib/prisma';

export default function ProfilePage() {
  async function updateBio(formData: FormData) {
    'use server';
    const bio = formData.get('bio');
    await prisma.profile.update({
      data: { bio: String(bio) }
    });
  }

  return <form action={updateBio}><button type="submit">Save</button></form>;
}
`;
      const findings = RiskEngine.analyzeFile('/app/profile/page.tsx', code);
      const actionFinding = findings.find((f) => f.ruleId === 'PC-ACTION-001');

      expect(actionFinding).toBeDefined();
      expect(actionFinding?.title).toContain('updateBio');
    });

    it('should NOT flag read-only queries in a "use server" file', () => {
      const code = `'use server';

import { prisma } from '@/lib/prisma';

export async function getPublishedPosts() {
  return await prisma.post.findMany({
    where: { published: true }
  });
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/posts.ts', code);
      const actionFinding = findings.find((f) => f.ruleId === 'PC-ACTION-001');

      expect(actionFinding).toBeUndefined();
    });
  });

  describe('PC-LEAK-001: Server Secret or Module Leak in Client Component', () => {
    it('should flag private server environment variable access in a "use client" file', () => {
      const code = `'use client';

import { useEffect } from 'react';

export function PaymentWidget() {
  const secretKey = process.env.STRIPE_SECRET_KEY; // LEAK!

  return <div>Payment: {secretKey ? 'ready' : 'missing'}</div>;
}
`;
      const findings = RiskEngine.analyzeFile('/components/PaymentWidget.tsx', code);
      const leakFinding = findings.find((f) => f.ruleId === 'PC-LEAK-001');

      expect(leakFinding).toBeDefined();
      expect(leakFinding?.severity).toBe('HIGH');
      expect(leakFinding?.title).toContain('STRIPE_SECRET_KEY');
    });

    it('should NOT flag NEXT_PUBLIC_ variables or NODE_ENV in "use client" files', () => {
      const code = `'use client';

export function ApiStatus() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const isDev = process.env.NODE_ENV === 'development';

  return <div>{apiUrl} ({isDev ? 'dev' : 'prod'})</div>;
}
`;
      const findings = RiskEngine.analyzeFile('/components/ApiStatus.tsx', code);
      const leakFindings = findings.filter((f) => f.ruleId === 'PC-LEAK-001');

      expect(leakFindings).toHaveLength(0);
    });

    it('should flag server-only module imports in a "use client" file', () => {
      const code = `'use client';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

export function UserCard() {
  return <div>Client Component</div>;
}
`;
      const findings = RiskEngine.analyzeFile('/components/UserCard.tsx', code);
      const modFindings = findings.filter((f) => f.ruleId === 'PC-LEAK-001');

      expect(modFindings.length).toBeGreaterThanOrEqual(2);
      expect(modFindings.some((f) => f.title.includes('@prisma/client'))).toBe(true);
      expect(modFindings.some((f) => f.title.includes('bcrypt'))).toBe(true);
    });
  });

  describe('PC-ACTION-002: Missing Cache Revalidation in Server Action', () => {
    it('should flag a mutating Server Action missing revalidatePath or revalidateTag', () => {
      const code = `'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';

export async function addComment(comment: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthenticated');

  await db.comment.create({
    data: { text: comment }
  });
  // Missing revalidatePath('/')!
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/comment.ts', code);
      const cacheFinding = findings.find((f) => f.ruleId === 'PC-ACTION-002');

      expect(cacheFinding).toBeDefined();
      expect(cacheFinding?.severity).toBe('MEDIUM');
      expect(cacheFinding?.title).toContain('Missing Cache Revalidation');
    });

    it('should NOT flag a Server Action that calls revalidatePath', () => {
      const code = `'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function addComment(comment: string) {
  const session = await auth();
  if (!session) throw new Error('Unauthenticated');

  await db.comment.create({
    data: { text: comment }
  });
  revalidatePath('/posts');
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/comment.ts', code);
      const cacheFinding = findings.find((f) => f.ruleId === 'PC-ACTION-002');

      expect(cacheFinding).toBeUndefined();
    });
  });

  describe('PC-ACTION-003: Unvalidated Input / Mass Assignment in Server Action', () => {
    it('should flag raw input passed directly to database update without schema validation', () => {
      const code = `'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';

export async function updateUserSettings(data: any) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  // Mass assignment: 'data' passed directly without Zod parsing
  await db.user.update({
    where: { id: session.user.id },
    data: data
  });
  revalidatePath('/settings');
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/settings.ts', code);
      const inputFinding = findings.find((f) => f.ruleId === 'PC-ACTION-003');

      expect(inputFinding).toBeDefined();
      expect(inputFinding?.severity).toBe('HIGH');
      expect(inputFinding?.title).toContain('Unvalidated Input / Mass Assignment');
    });

    it('should NOT flag Server Actions that validate input with Zod safeParse', () => {
      const code = `'use server';

import { db } from '@/lib/db';
import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const schema = z.object({ theme: z.string() });

export async function updateUserSettings(data: any) {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('Invalid input');

  await db.user.update({
    where: { id: session.user.id },
    data: parsed.data
  });
  revalidatePath('/settings');
}
`;
      const findings = RiskEngine.analyzeFile('/app/actions/settings.ts', code);
      const inputFinding = findings.find((f) => f.ruleId === 'PC-ACTION-003');

      expect(inputFinding).toBeUndefined();
    });
  });

  describe('AutoFixEngine for Next.js Security Rules', () => {
    it('should auto-fix PC-LEAK-001 by prefixing private environment variable with NEXT_PUBLIC_', () => {
      const original = "const url = process.env.API_ENDPOINT || '';";
      const res = AutoFixEngine.fixContent('/components/App.tsx', original, [
        { ruleId: 'PC-LEAK-001', file: '/components/App.tsx', line: 1 }
      ]);

      expect(res.appliedFixes).toHaveLength(1);
      expect(res.newContent).toBe("const url = process.env.NEXT_PUBLIC_API_ENDPOINT || '';");
    });

    it('should auto-fix PC-ACTION-002 by adding revalidatePath("/")', () => {
      const original = "  await db.post.create({ data });";
      const res = AutoFixEngine.fixContent('/app/actions/post.ts', original, [
        { ruleId: 'PC-ACTION-002', file: '/app/actions/post.ts', line: 1 }
      ]);

      expect(res.appliedFixes).toHaveLength(1);
      expect(res.newContent).toContain("revalidatePath('/');");
    });
  });
});
