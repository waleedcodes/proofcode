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
