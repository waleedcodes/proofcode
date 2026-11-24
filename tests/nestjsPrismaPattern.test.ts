import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RiskEngine } from '../src/rules/riskEngine';
import { AutoFixEngine } from '../src/fixer/autoFixEngine';
import { ProjectGraph } from '../src/graph/projectGraph';

describe('NestJS & Prisma Real-World Patterns', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-nestjs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should NOT flag normal awaited Prisma queries in async service methods (zero false positives)', () => {
    const serviceCode = `
import { Injectable } from '@nestjs/common';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: any) {}

  async getUnmarkedLectures(dayOfWeek: number) {
    const timetableSlots = await this.prisma.timetableSlot.findMany({
      where: { dayOfWeek },
      include: {
        teachingAssignment: {
          include: {
            teacher: true,
            subject: true,
            section: true,
          },
        },
      },
    });

    return timetableSlots;
  }
}
`;
    const filePath = path.join(tempDir, 'attendance.service.ts');
    fs.writeFileSync(filePath, serviceCode, 'utf8');

    // Simulate changed lines on the await query
    const risks = RiskEngine.analyzeFile(filePath, undefined, {
      oldPath: 'attendance.service.ts',
      newPath: 'attendance.service.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [],
      addedLines: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
      deletedLines: [],
      modifiedLineRanges: [{ start: 10, end: 22 }]
    });

    const asyncRisks = risks.filter((r) => r.ruleId === 'PC-REL-006');
    expect(asyncRisks).toHaveLength(0);
  });

  it('should flag floating unawaited database mutations (PC-REL-006)', () => {
    const serviceCode = `
export class AuditService {
  constructor(private readonly prisma: any) {}

  async logAction(userId: string, action: string) {
    this.prisma.auditLog.create({
      data: { userId, action }
    });
    return true;
  }
}
`;
    const filePath = path.join(tempDir, 'audit.service.ts');
    fs.writeFileSync(filePath, serviceCode, 'utf8');

    const risks = RiskEngine.analyzeFile(filePath, undefined, {
      oldPath: 'audit.service.ts',
      newPath: 'audit.service.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [],
      addedLines: [6],
      deletedLines: [],
      modifiedLineRanges: [{ start: 6, end: 8 }]
    });

    const floatingRisks = risks.filter((r) => r.ruleId === 'PC-REL-006');
    expect(floatingRisks).toHaveLength(1);
    expect(floatingRisks[0].title).toContain('Floating');
  });

  it('should flag unhandled await inside unhandled event listener callbacks (PC-REL-006)', () => {
    const code = `
import { EventEmitter } from 'events';
const emitter = new EventEmitter();

emitter.on('userLoggedIn', async (user: any) => {
  await trackAnalytics(user.id);
});
`;
    const filePath = path.join(tempDir, 'events.ts');
    fs.writeFileSync(filePath, code, 'utf8');

    const risks = RiskEngine.analyzeFile(filePath, undefined, {
      oldPath: 'events.ts',
      newPath: 'events.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [],
      addedLines: [6],
      deletedLines: [],
      modifiedLineRanges: [{ start: 6, end: 6 }]
    });

    const callbackRisks = risks.filter((r) => r.ruleId === 'PC-REL-006');
    expect(callbackRisks).toHaveLength(1);
    expect(callbackRisks[0].title).toContain('Event Listener');
  });

  it('should NOT flag database results guarded by if (entity) or findUniqueOrThrow (PC-DATA-001)', () => {
    const code = `
export class UserService {
  async getUserPositiveGuard(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (user) {
      return user.email;
    }
    return null;
  }

  async getUserOrThrow(id: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } });
    return user.email;
  }
}
`;
    const filePath = path.join(tempDir, 'user.service.ts');
    fs.writeFileSync(filePath, code, 'utf8');

    const risks = RiskEngine.analyzeFile(filePath, undefined, {
      oldPath: 'user.service.ts',
      newPath: 'user.service.ts',
      isNew: false,
      isDeleted: false,
      isRenamed: false,
      hunks: [],
      addedLines: [4, 5, 6, 12, 13],
      deletedLines: [],
      modifiedLineRanges: [{ start: 1, end: 16 }]
    });

    const nullRisks = risks.filter((r) => r.ruleId === 'PC-DATA-001');
    expect(nullRisks).toHaveLength(0);
  });

  it('should auto-fix floating unawaited async calls by inserting await', () => {
    const code = `    this.prisma.user.update({ where: { id }, data: { status: 'ACTIVE' } });`;
    const res = AutoFixEngine.fixContent('test.ts', code, [
      { ruleId: 'PC-REL-006', file: 'test.ts', line: 1 }
    ]);

    expect(res.appliedFixes.length).toBe(1);
    expect(res.newContent).toContain('await this.prisma.user.update');
  });

  it('should resolve class method callers across NestJS controllers via Dependency Injection', async () => {
    // 1. Service
    const servicePath = path.join(tempDir, 'attendance.service.ts');
    fs.writeFileSync(
      servicePath,
      `export class AttendanceService {
  async getUnmarkedLectures(dayOfWeek: number) {
    return [];
  }
}`,
      'utf8'
    );

    // 2. Controller importing AttendanceService and calling getUnmarkedLectures
    const controllerPath = path.join(tempDir, 'attendance.controller.ts');
    fs.writeFileSync(
      controllerPath,
      `import { AttendanceService } from './attendance.service';

export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  async getUnmarked(day: number) {
    return this.attendanceService.getUnmarkedLectures(day);
  }
}`,
      'utf8'
    );

    const graph = new ProjectGraph(tempDir);
    await graph.buildGraph([servicePath, controllerPath]);

    // Touch the method getUnmarkedLectures in attendance.service.ts (lines 2-4)
    const changedLinesMap = new Map<string, number[]>();
    changedLinesMap.set(servicePath, [2, 3]);

    const impact = graph.computeImpact(changedLinesMap);
    expect(impact.changedSymbols.length).toBeGreaterThanOrEqual(1);

    const methodSymbol = impact.changedSymbols.find(
      (s) => s.symbolName === 'AttendanceService.getUnmarkedLectures'
    );
    expect(methodSymbol).toBeDefined();
    expect(methodSymbol!.callers.length).toBeGreaterThanOrEqual(1);
    expect(methodSymbol!.callers[0].callerName).toBe('AttendanceController.getUnmarked');
    expect(methodSymbol!.callers[0].filePath).toBe(controllerPath);
  });
});
