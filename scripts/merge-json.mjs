#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [targetPathArg, overridesPathArg] = process.argv.slice(2);

if (!targetPathArg || !overridesPathArg) {
  console.error('Usage: merge-json.mjs <target> <overrides>');
  process.exit(1);
}

const targetPath = resolve(process.cwd(), targetPathArg);
const overridesPath = resolve(process.cwd(), overridesPathArg);

const target = JSON.parse(readFileSync(targetPath, 'utf8'));
const overrides = JSON.parse(readFileSync(overridesPath, 'utf8'));

const deepMerge = (base, patch) => {
  const output = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const current = output[key];
      output[key] = deepMerge(
        current && typeof current === 'object' && !Array.isArray(current) ? current : {},
        value
      );
    } else {
      output[key] = value;
    }
  }
  return output;
};

const merged = deepMerge(target, overrides);
writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
