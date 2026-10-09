const esbuild = require('esbuild');

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions[]} */
const buildConfigs = [
  // VS Code Extension Bundle
  {
    entryPoints: ['src/extension/index.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
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
