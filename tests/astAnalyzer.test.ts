import { describe, expect, it } from 'vitest';
import { AstAnalyzer } from '../src/analyzer/astAnalyzer';

describe('AstAnalyzer', () => {
  it('should extract exported functions and their calls', () => {
    const code = `
import { db } from './db';

export function getUser(userId: string) {
  const user = db.user.findUnique(userId);
  return user;
}

export const updateUser = (userId: string, data: any) => {
  db.user.update(userId, data);
};
`;

    const analysis = AstAnalyzer.analyzeFile('/test/auth.ts', code);
    expect(analysis.symbols).toHaveLength(2);
    expect(analysis.symbols[0].name).toBe('getUser');
    expect(analysis.symbols[0].isExported).toBe(true);
    expect(analysis.symbols[0].calls).toContain('findUnique');

    expect(analysis.symbols[1].name).toBe('updateUser');
    expect(analysis.symbols[1].kind).toBe('arrow_function');
    expect(analysis.symbols[1].isExported).toBe(true);
  });

  it('should detect Next.js App Router API endpoints', () => {
    const code = `
export async function GET(request: Request) {
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  return Response.json({ created: true });
}
`;

    const analysis = AstAnalyzer.analyzeFile('/app/api/orders/route.ts', code);
    expect(analysis.hasApiRoute).toBe(true);
    expect(analysis.apiRoutes).toHaveLength(2);
    expect(analysis.apiRoutes[0].method).toBe('GET');
    expect(analysis.apiRoutes[1].method).toBe('POST');
  });

  it('should find symbols intersecting with modified lines', () => {
    const code = `
export function first() {
  return 1;
}

export function second() {
  return 2;
}
`;
    const analysis = AstAnalyzer.analyzeFile('/test/funcs.ts', code);
    // line 2 is in 'first'
    const touched = AstAnalyzer.findSymbolsAtLines(analysis.symbols, [3]);
    expect(touched).toHaveLength(1);
    expect(touched[0].name).toBe('first');
  });
});
