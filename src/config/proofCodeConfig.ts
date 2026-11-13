import * as fs from 'node:fs';
import * as path from 'node:path';
import { RiskSeverity } from '../types';

export type RuleOverrideLevel = 'off' | 'warn' | 'error' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ProofCodeConfig {
  thresholds?: {
    minScore?: number;
    blockOnHighRisk?: boolean;
  };
  ignore?: string[];
  rules?: Record<string, RuleOverrideLevel>;
}

export const DEFAULT_CONFIG: Required<ProofCodeConfig> = {
  thresholds: {
    minScore: 75,
    blockOnHighRisk: true
  },
  ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  rules: {}
};

export class ProofCodeConfigLoader {
  /**
   * Searches for config in:
   * 1. .proofcode/config.json
   * 2. proofcode.config.json
   * 3. package.json ("proofcode" property)
   */
  public static loadConfig(workspaceRoot: string): Required<ProofCodeConfig> {
    const root = path.resolve(workspaceRoot);
    const candidateFiles = [
      path.join(root, '.proofcode', 'config.json'),
      path.join(root, 'proofcode.config.json')
    ];

    for (const candidate of candidateFiles) {
      if (fs.existsSync(candidate)) {
        try {
          const raw = fs.readFileSync(candidate, 'utf8');
          const parsed = JSON.parse(raw);
          return this.mergeWithDefault(parsed);
        } catch (err) {
          console.warn(`[ProofCode] Warning: Failed to parse config file at ${candidate}:`, err);
        }
      }
    }

    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.proofcode && typeof pkg.proofcode === 'object') {
          return this.mergeWithDefault(pkg.proofcode);
        }
      } catch (err) {
        console.warn(`[ProofCode] Warning: Failed to parse package.json:`, err);
      }
    }

    return { ...DEFAULT_CONFIG };
  }

  /**
   * Scaffolds a new .proofcode/config.json file if one does not exist.
   */
  public static initConfigFile(
    workspaceRoot: string,
    options: { force?: boolean } = {}
  ): { success: boolean; created: boolean; path: string; message: string } {
    const root = path.resolve(workspaceRoot);
    const proofcodeDir = path.join(root, '.proofcode');
    const targetPath = path.join(proofcodeDir, 'config.json');

    if (fs.existsSync(targetPath) && !options.force) {
      return {
        success: true,
        created: false,
        path: targetPath,
        message: `ProofCode config already exists at ${targetPath}`
      };
    }

    try {
      if (!fs.existsSync(proofcodeDir)) {
        fs.mkdirSync(proofcodeDir, { recursive: true });
      }

      const templateConfig: ProofCodeConfig = {
        thresholds: {
          minScore: 75,
          blockOnHighRisk: true
        },
        ignore: [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/.git/**'
        ],
        rules: {
          'PC-REL-008': 'error',
          'PC-TYPE-001': 'warn',
          'PC-MUT-001': 'error',
          'PC-ENV-001': 'error',
          'PC-IMPORT-001': 'error'
        }
      };

      fs.writeFileSync(targetPath, JSON.stringify(templateConfig, null, 2) + '\n', 'utf8');

      return {
        success: true,
        created: true,
        path: targetPath,
        message: `Successfully created ProofCode configuration at ${targetPath}`
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        created: false,
        path: targetPath,
        message: `Failed to create ProofCode configuration: ${msg}`
      };
    }
  }

  public static mergeWithDefault(userConfig: Partial<ProofCodeConfig>): Required<ProofCodeConfig> {
    return {
      thresholds: {
        minScore: userConfig.thresholds?.minScore ?? DEFAULT_CONFIG.thresholds.minScore,
        blockOnHighRisk: userConfig.thresholds?.blockOnHighRisk ?? DEFAULT_CONFIG.thresholds.blockOnHighRisk
      },
      ignore: Array.isArray(userConfig.ignore)
        ? [...DEFAULT_CONFIG.ignore, ...userConfig.ignore]
        : [...DEFAULT_CONFIG.ignore],
      rules: {
        ...DEFAULT_CONFIG.rules,
        ...(userConfig.rules || {})
      }
    };
  }

  /**
   * Applies rule configuration overrides to a list of risk findings.
   */
  public static applyRuleOverrides<T extends { ruleId: string; severity: RiskSeverity }>(
    findings: T[],
    config: Required<ProofCodeConfig>
  ): T[] {
    const rulesConfig = config.rules;
    if (!rulesConfig || Object.keys(rulesConfig).length === 0) {
      return findings;
    }

    const result: T[] = [];
    for (const finding of findings) {
      const override = rulesConfig[finding.ruleId];
      if (override === 'off') {
        continue;
      }
      if (override === 'error' || override === 'HIGH') {
        result.push({ ...finding, severity: 'HIGH' });
      } else if (override === 'warn' || override === 'MEDIUM') {
        result.push({ ...finding, severity: 'MEDIUM' });
      } else if (override === 'LOW') {
        result.push({ ...finding, severity: 'LOW' });
      } else {
        result.push(finding);
      }
    }
    return result;
  }
}

