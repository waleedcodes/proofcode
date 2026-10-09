import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProofCodeEngine } from '../src/engine/proofCodeEngine';
import { ReportFormatter } from '../src/engine/reportFormatter';

async function main() {
  const demoRoot = path.resolve(__dirname, '../examples/demo-app');
  console.log('\n===============================================================');
  console.log('   🚀 PROOFCODE KILLER WORKFLOW DEMO (Next.js AI Change)       ');
  console.log('===============================================================');
  console.log(`Analyzing codebase at: ${demoRoot}\n`);
