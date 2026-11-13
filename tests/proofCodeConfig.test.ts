import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProofCodeConfigLoader, DEFAULT_CONFIG } from '../src/config/proofCodeConfig';
import { RiskFinding } from '../src/types';

describe('ProofCodeConfigLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proofcode-config-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return default config when no config file exists', () => {
    const config = ProofCodeConfigLoader.loadConfig(tempDir);
    expect(config.thresholds.minScore).toBe(DEFAULT_CONFIG.thresholds.minScore);
    expect(config.thresholds.blockOnHighRisk).toBe(true);
    expect(config.ignore).toContain('**/node_modules/**');
  });

  it('should load config from .proofcode/config.json', () => {
    const proofcodeDir = path.join(tempDir, '.proofcode');
    fs.mkdirSync(proofcodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(proofcodeDir, 'config.json'),
      JSON.stringify({
        thresholds: { minScore: 90, blockOnHighRisk: false },
        rules: { 'PC-TYPE-001': 'off', 'PC-ENV-001': 'warn' }
      }),
      'utf8'
    );

    const config = ProofCodeConfigLoader.loadConfig(tempDir);
    expect(config.thresholds.minScore).toBe(90);
    expect(config.thresholds.blockOnHighRisk).toBe(false);
    expect(config.rules['PC-TYPE-001']).toBe('off');
    expect(config.rules['PC-ENV-001']).toBe('warn');
  });

  it('should load config from proofcode.config.json', () => {
    fs.writeFileSync(
      path.join(tempDir, 'proofcode.config.json'),
      JSON.stringify({
        thresholds: { minScore: 60 }
      }),
      'utf8'
    );

    const config = ProofCodeConfigLoader.loadConfig(tempDir);
    expect(config.thresholds.minScore).toBe(60);
  });

  it('should load config from package.json proofcode property', () => {
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        proofcode: {
          thresholds: { minScore: 88 }
        }
      }),
      'utf8'
    );

    const config = ProofCodeConfigLoader.loadConfig(tempDir);
    expect(config.thresholds.minScore).toBe(88);
  });

  it('should filter out disabled rules when override is off', () => {
    const sampleRisks: RiskFinding[] = [
      {
        id: '1',
        ruleId: 'PC-TYPE-001',
        category: 'quality',
        title: 'as any',
        severity: 'MEDIUM',
        description: 'test',
        file: 'test.ts',
        line: 1,
        evidenceTrace: []
      },
      {
        id: '2',
        ruleId: 'PC-SEC-001',
        category: 'security',
        title: 'SQL injection',
        severity: 'HIGH',
        description: 'test',
        file: 'test.ts',
        line: 5,
        evidenceTrace: []
      }
    ];

    const config = ProofCodeConfigLoader.mergeWithDefault({
      rules: {
        'PC-TYPE-001': 'off'
      }
    });

    const filtered = ProofCodeConfigLoader.applyRuleOverrides(sampleRisks, config);
    expect(filtered.length).toBe(1);
    expect(filtered[0].ruleId).toBe('PC-SEC-001');
  });

  it('should elevate or lower rule severities based on overrides', () => {
    const sampleRisks: RiskFinding[] = [
      {
        id: '1',
        ruleId: 'PC-TYPE-001',
        category: 'quality',
        title: 'as any',
        severity: 'MEDIUM',
        description: 'test',
        file: 'test.ts',
        line: 1,
        evidenceTrace: []
      }
    ];

    const config = ProofCodeConfigLoader.mergeWithDefault({
      rules: {
        'PC-TYPE-001': 'error'
      }
    });

    const overridden = ProofCodeConfigLoader.applyRuleOverrides(sampleRisks, config);
    expect(overridden[0].severity).toBe('HIGH');
  });

  it('should scaffold .proofcode/config.json with initConfigFile', () => {
    const res = ProofCodeConfigLoader.initConfigFile(tempDir);
    expect(res.success).toBe(true);
    expect(res.created).toBe(true);
    expect(fs.existsSync(res.path)).toBe(true);

    const content = JSON.parse(fs.readFileSync(res.path, 'utf8'));
    expect(content.thresholds.minScore).toBe(75);
    expect(content.rules['PC-REL-008']).toBe('error');

    // Calling again without force should not overwrite
    const res2 = ProofCodeConfigLoader.initConfigFile(tempDir);
    expect(res2.success).toBe(true);
    expect(res2.created).toBe(false);

    // Calling with force should succeed
    const res3 = ProofCodeConfigLoader.initConfigFile(tempDir, { force: true });
    expect(res3.success).toBe(true);
    expect(res3.created).toBe(true);
  });
});

