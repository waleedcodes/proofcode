import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { ContractAnalyzer } from '../src/analyzer/contractAnalyzer';
import { ProjectGraph } from '../src/graph/projectGraph';
import { GitService } from '../src/git/gitService';
import { FileDiff } from '../src/types';
import { AstAnalyzer } from '../src/analyzer/astAnalyzer';

describe('ContractAnalyzer', () => {
  it('should detect breaking contract when a new required parameter is added and caller passes fewer args', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const graph = new ProjectGraph(repoRoot);

    const oldHelperCode = `
export function formatOrder(orderId: string) {
  return 'Order: ' + orderId;
}
`;
    const newHelperCode = `
export function formatOrder(orderId: string, requiredTenantId: string) {
  return orderId + '-' + requiredTenantId;
}
`;
    const callerCode = `
import { formatOrder } from './testHelper';
export function render() {
  return formatOrder('123');
}
`;

    const mockGitService = {
      getFileContentAtRef: async () => oldHelperCode
    } as unknown as GitService;

    const helperPath = path.resolve(repoRoot, 'src/testHelper.ts');
    const callerPath = path.resolve(repoRoot, 'src/testCaller.ts');

    graph['fileAnalyses'].set(helperPath, AstAnalyzer.analyzeFile(helperPath, newHelperCode));
    graph['fileAnalyses'].set(callerPath, AstAnalyzer.analyzeFile(callerPath, callerCode));

    let callerSet = graph['fileDependents'].get(helperPath);
    if (!callerSet) {
      callerSet = new Set();
      graph['fileDependents'].set(helperPath, callerSet);
    }
    callerSet.add(callerPath);

    const filesToVerify: FileDiff[] = [
      {
        oldPath: 'src/testHelper.ts',
        newPath: 'src/testHelper.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [2],
        deletedLines: [2],
        modifiedLineRanges: [{ start: 2, end: 2 }]
      }
    ];

    const mockReadFile = (p: string) => {
      if (p.includes('testHelper.ts')) return newHelperCode;
      if (p.includes('testCaller.ts')) return callerCode;
      return '';
    };

    const findings = await ContractAnalyzer.analyzeContractBreaks(
      repoRoot,
      filesToVerify,
      graph,
      mockGitService,
      mockReadFile
    );

    const breakFinding = findings.find((f) => f.ruleId === 'PC-BREAK-001');
    expect(breakFinding).toBeDefined();
    expect(breakFinding?.title).toContain('Required Parameter');
    expect(breakFinding?.description).toContain('now requires 2 parameters');
    expect(breakFinding?.severity).toBe('HIGH');
  });

  it('should detect breaking contract when an exported symbol is deleted while imported elsewhere', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const graph = new ProjectGraph(repoRoot);

    const oldServiceCode = `
export function legacyAuth() { return true; }
`;
    const newServiceCode = `
export function modernAuth() { return true; }
`;
    const consumerCode = `
import { legacyAuth } from './testService';
export function run() { return legacyAuth(); }
`;

    const mockGitService = {
      getFileContentAtRef: async () => oldServiceCode
    } as unknown as GitService;

    const servicePath = path.resolve(repoRoot, 'src/testService.ts');
    const consumerPath = path.resolve(repoRoot, 'src/testConsumer.ts');

    const consumerAnalysis = AstAnalyzer.analyzeFile(consumerPath, consumerCode);
    consumerAnalysis.imports[0].resolvedPath = servicePath;

    graph['fileAnalyses'].set(servicePath, AstAnalyzer.analyzeFile(servicePath, newServiceCode));
    graph['fileAnalyses'].set(consumerPath, consumerAnalysis);

    const depSet = new Set<string>([consumerPath]);
    graph['fileDependents'].set(servicePath, depSet);

    const filesToVerify: FileDiff[] = [
      {
        oldPath: 'src/testService.ts',
        newPath: 'src/testService.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [2],
        deletedLines: [2],
        modifiedLineRanges: [{ start: 2, end: 2 }]
      }
    ];

    const mockReadFile = (p: string) => {
      if (p.includes('testService.ts')) return newServiceCode;
      if (p.includes('testConsumer.ts')) return consumerCode;
      return '';
    };

    const findings = await ContractAnalyzer.analyzeContractBreaks(
      repoRoot,
      filesToVerify,
      graph,
      mockGitService,
      mockReadFile
    );

    const delFinding = findings.find((f) => f.ruleId === 'PC-BREAK-001');
    expect(delFinding).toBeDefined();
    expect(delFinding?.title).toContain('Deleted or Renamed');
    expect(delFinding?.description).toContain('legacyAuth');
  });

  it('should NOT flag breaking contract when added parameter is optional', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const graph = new ProjectGraph(repoRoot);

    const oldCode = `
export function getUser(id: string) { return id; }
`;
    const newCode = `
export function getUser(id: string, includeRoles?: boolean) { return id; }
`;
    const callerCode = `
import { getUser } from './userHelper';
export function run() { return getUser('u1'); }
`;

    const mockGitService = {
      getFileContentAtRef: async () => oldCode
    } as unknown as GitService;

    const userHelperPath = path.resolve(repoRoot, 'src/userHelper.ts');
    const callerPath = path.resolve(repoRoot, 'src/userCaller.ts');

    graph['fileAnalyses'].set(userHelperPath, AstAnalyzer.analyzeFile(userHelperPath, newCode));
    graph['fileAnalyses'].set(callerPath, AstAnalyzer.analyzeFile(callerPath, callerCode));

    const depSet = new Set<string>([callerPath]);
    graph['fileDependents'].set(userHelperPath, depSet);

    const filesToVerify: FileDiff[] = [
      {
        oldPath: 'src/userHelper.ts',
        newPath: 'src/userHelper.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [2],
        deletedLines: [2],
        modifiedLineRanges: [{ start: 2, end: 2 }]
      }
    ];

    const mockReadFile = (p: string) => {
      if (p.includes('userHelper.ts')) return newCode;
      if (p.includes('userCaller.ts')) return callerCode;
      return '';
    };

    const findings = await ContractAnalyzer.analyzeContractBreaks(
      repoRoot,
      filesToVerify,
      graph,
      mockGitService,
      mockReadFile
    );

    expect(findings.length).toBe(0);
  });

  it('should detect breaking contract when parameter type changes incompatibly', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const graph = new ProjectGraph(repoRoot);

    const oldCode = `
export function processId(id: string) { return id; }
`;
    const newCode = `
export function processId(id: number) { return id; }
`;
    const callerCode = `
import { processId } from './idHelper';
export function test() { return processId('abc'); }
`;

    const mockGitService = {
      getFileContentAtRef: async () => oldCode
    } as unknown as GitService;

    const idHelperPath = path.resolve(repoRoot, 'src/idHelper.ts');
    const callerPath = path.resolve(repoRoot, 'src/idCaller.ts');

    graph['fileAnalyses'].set(idHelperPath, AstAnalyzer.analyzeFile(idHelperPath, newCode));
    graph['fileAnalyses'].set(callerPath, AstAnalyzer.analyzeFile(callerPath, callerCode));

    const depSet = new Set<string>([callerPath]);
    graph['fileDependents'].set(idHelperPath, depSet);

    const filesToVerify: FileDiff[] = [
      {
        oldPath: 'src/idHelper.ts',
        newPath: 'src/idHelper.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [2],
        deletedLines: [2],
        modifiedLineRanges: [{ start: 2, end: 2 }]
      }
    ];

    const mockReadFile = (p: string) => {
      if (p.includes('idHelper.ts')) return newCode;
      if (p.includes('idCaller.ts')) return callerCode;
      return '';
    };

    const findings = await ContractAnalyzer.analyzeContractBreaks(
      repoRoot,
      filesToVerify,
      graph,
      mockGitService,
      mockReadFile
    );

    const typeFinding = findings.find((f) => f.ruleId === 'PC-BREAK-001' && f.title.includes('Type Changed'));
    expect(typeFinding).toBeDefined();
    expect(typeFinding?.severity).toBe('HIGH');
    expect(typeFinding?.description).toContain("from 'string' to 'number'");
  });

  it('should detect breaking contract when return type is widened to nullable', async () => {
    const repoRoot = path.resolve(__dirname, '..');
    const graph = new ProjectGraph(repoRoot);

    const oldCode = `
export function findAccount(id: string): Account { return {} as any; }
`;
    const newCode = `
export function findAccount(id: string): Account | null { return null; }
`;
    const consumerCode = `
import { findAccount } from './accountHelper';
export function run() {
  const acc = findAccount('1');
  return acc.name;
}
`;

    const mockGitService = {
      getFileContentAtRef: async () => oldCode
    } as unknown as GitService;

    const accountHelperPath = path.resolve(repoRoot, 'src/accountHelper.ts');
    const consumerPath = path.resolve(repoRoot, 'src/accountConsumer.ts');

    graph['fileAnalyses'].set(accountHelperPath, AstAnalyzer.analyzeFile(accountHelperPath, newCode));
    graph['fileAnalyses'].set(consumerPath, AstAnalyzer.analyzeFile(consumerPath, consumerCode));

    const depSet = new Set<string>([consumerPath]);
    graph['fileDependents'].set(accountHelperPath, depSet);

    const filesToVerify: FileDiff[] = [
      {
        oldPath: 'src/accountHelper.ts',
        newPath: 'src/accountHelper.ts',
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        hunks: [],
        addedLines: [2],
        deletedLines: [2],
        modifiedLineRanges: [{ start: 2, end: 2 }]
      }
    ];

    const mockReadFile = (p: string) => {
      if (p.includes('accountHelper.ts')) return newCode;
      if (p.includes('accountConsumer.ts')) return consumerCode;
      return '';
    };

    const findings = await ContractAnalyzer.analyzeContractBreaks(
      repoRoot,
      filesToVerify,
      graph,
      mockGitService,
      mockReadFile
    );

    const retFinding = findings.find((f) => f.ruleId === 'PC-BREAK-001' && f.title.includes('Nullable Value'));
    expect(retFinding).toBeDefined();
    expect(retFinding?.severity).toBe('HIGH');
    expect(retFinding?.description).toContain("from 'Account' to 'Account | null'");
  });
});
