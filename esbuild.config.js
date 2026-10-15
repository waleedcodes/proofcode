const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions[]} */
const buildConfigs = [
  // Core Verification Engine (Heavy bundle with TypeScript compiler, lazy-loaded on demand)
  {
    entryPoints: ['src/engine/proofCodeEngine.ts'],
    bundle: true,
    outfile: 'dist/proofCodeEngine.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info'
  },
  // VS Code Extension Entrypoint (Ultra-lightweight ~50KB bundle for sub-15ms activation)
  {
    entryPoints: ['src/extension/index.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', './proofCodeEngine'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info'
  },
  // Standalone CLI Bundle
  {
    entryPoints: ['src/cli.ts'],
    bundle: true,
    outfile: 'dist/cli.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    banner: {
      js: '#!/usr/bin/env node\n'
    },
    sourcemap: !isProduction,
    minify: isProduction,
    logLevel: 'info'
  }
];

async function main() {
  try {
    for (const config of buildConfigs) {
      if (isWatch) {
        const ctx = await esbuild.context(config);
        await ctx.watch();
        console.log(`Watching ${config.entryPoints[0]} -> ${config.outfile}`);
      } else {
        await esbuild.build(config);
      }
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
