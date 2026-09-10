import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = (await readFile('tests/secret-areas-browser.mjs', 'utf8'))
  .replace("const output = '.verification/secret-areas';", "const output = '.verification/secret-review-20260910/baseline';")
  .replace(/from '([^']+)'/g, (match, specifier) => {
    if (specifier.startsWith('../')) return `from '${pathToFileURL(resolve('tests', specifier)).href}'`;
    if (specifier === '@playwright/test') return `from '${import.meta.resolve(specifier)}'`;
    return match;
  });
await import(`data:text/javascript,${encodeURIComponent(source)}`);
