import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectGraph } from '../src/graph/projectGraph';

describe('ProjectGraph', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-graph-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should map imports and compute reverse dependents', async () => {
    // File A: userService.ts
    const userPath = path.join(tempDir, 'userService.ts');
    fs.writeFileSync(
      userPath,
      `export function getUser(id: string) { return { id }; }`,
      'utf8'
    );

    // File B: orderController.ts imports userService
    const orderPath = path.join(tempDir, 'orderController.ts');
    fs.writeFileSync(
      orderPath,
      `import { getUser } from './userService';
export function handleOrder(userId: string) {
  const user = getUser(userId);
  return user;
}`,
      'utf8'
    );

    const graph = new ProjectGraph(tempDir);
    await graph.buildGraph([userPath, orderPath]);

    const dependents = graph.getDependents(userPath);
    expect(dependents.has(orderPath)).toBe(true);

    const changedLinesMap = new Map<string, number[]>();
    changedLinesMap.set(userPath, [1]);

    const impact = graph.computeImpact(changedLinesMap);
    expect(impact.changedFiles).toContain(userPath);
    expect(impact.changedSymbols).toHaveLength(1);
    expect(impact.changedSymbols[0].symbolName).toBe('getUser');
    expect(impact.changedSymbols[0].callers).toHaveLength(1);
    expect(impact.changedSymbols[0].callers[0].callerName).toBe('handleOrder');
    expect(impact.untestedCallersCount).toBe(1);
  });

  it('should detect intra-file callers and class-level method callers', async () => {
    const servicePath = path.join(tempDir, 'paymentService.ts');
    fs.writeFileSync(
      servicePath,
      `export class PaymentService {
  validateCard(num: string) {
    return num.length === 16;
  }

  processPayment(num: string) {
    if (this.validateCard(num)) {
      return true;
    }
    return false;
  }
}`,
      'utf8'
    );

    const graph = new ProjectGraph(tempDir);
    await graph.buildGraph([servicePath]);

    // Touch validateCard method (line 2)
    const changedLinesMap = new Map<string, number[]>();
    changedLinesMap.set(servicePath, [2]);

    const impact = graph.computeImpact(changedLinesMap);
    const validateSymbol = impact.changedSymbols.find(
      (s) => s.symbolName === 'PaymentService.validateCard'
    );

    expect(validateSymbol).toBeDefined();
    expect(validateSymbol!.callers.length).toBeGreaterThanOrEqual(1);
    expect(validateSymbol!.callers[0].callerName).toBe('PaymentService.processPayment');
  });
});
