// Usage: node scripts/frame-loop-lint.ts [files...]  (default: all workspace sources)
// Checks `/** @frameLoop */` functions; `// frame-loop-ignore: <reason>` skips the next line.
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface FrameLoopDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
}

const TAG = 'frameLoop';
const IGNORE = 'frame-loop-ignore:';

/** Methods that allocate, iterate with callbacks or build strings. */
const BANNED_METHODS = new Set([
  'map',
  'filter',
  'forEach',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'slice',
  'subarray',
  'concat',
  'splice',
  'sort',
  'toSorted',
  'toReversed',
  'toSpliced',
  'with',
  'join',
  'split',
  'replace',
  'replaceAll',
  'substring',
  'substr',
  'trim',
  'trimStart',
  'trimEnd',
  'toLowerCase',
  'toUpperCase',
  'padStart',
  'padEnd',
  'repeat',
  'keys',
  'values',
  'entries',
  'from',
  'of',
  'push',
  'unshift',
]);

function isFrameLoop(node: ts.Node): boolean {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.text === TAG);
}

function isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** A function counts as tagged when it or the variable it is assigned to carries the tag. */
function hasFrameLoopTag(decl: ts.Node): boolean {
  if (isFrameLoop(decl)) return true;
  const parent = decl.parent;
  if (parent && ts.isVariableDeclaration(parent)) {
    const statement = parent.parent?.parent;
    return statement !== undefined && isFrameLoop(statement);
  }
  return false;
}

function isStringLike(checker: ts.TypeChecker, node: ts.Expression): boolean {
  const type = checker.getTypeAtLocation(node);
  return (type.getFlags() & ts.TypeFlags.StringLike) !== 0;
}

function isOwnSource(file: ts.SourceFile, program: ts.Program): boolean {
  return !file.isDeclarationFile && !program.isSourceFileFromExternalLibrary(file);
}

export function lintFrameLoop(fileNames: readonly string[]): FrameLoopDiagnostic[] {
  const program = ts.createProgram(fileNames, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    allowImportingTsExtensions: true,
    noEmit: true,
    strict: true,
    skipLibCheck: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const diagnostics: FrameLoopDiagnostic[] = [];

  for (const file of program.getSourceFiles()) {
    if (
      !isOwnSource(file, program) ||
      !fileNames.some((name) => resolve(name) === resolve(file.fileName))
    ) {
      continue;
    }
    const lines = file.text.split('\n');

    const report = (node: ts.Node, message: string): void => {
      const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
      if (line > 0 && lines[line - 1]?.includes(IGNORE)) return;
      diagnostics.push({ file: file.fileName, line: line + 1, column: character + 1, message });
    };

    const checkBody = (fn: ts.FunctionLikeDeclaration): void => {
      const visit = (node: ts.Node): void => {
        if (node !== fn && isFunctionLike(node)) {
          report(node, 'closure or nested function');
          return;
        }
        if (ts.isNewExpression(node)) report(node, 'allocation: new');
        else if (ts.isArrayLiteralExpression(node)) report(node, 'allocation: array literal');
        else if (ts.isObjectLiteralExpression(node)) report(node, 'allocation: object literal');
        else if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node))
          report(node, 'allocation: spread');
        else if (ts.isTemplateExpression(node)) report(node, 'string work: template literal');
        else if (
          ts.isBinaryExpression(node) &&
          (node.operatorToken.kind === ts.SyntaxKind.PlusToken ||
            node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
          (isStringLike(checker, node.left) || isStringLike(checker, node.right))
        ) {
          report(node, 'string work: concatenation');
        } else if (ts.isCallExpression(node)) {
          checkCall(node);
        }
        ts.forEachChild(node, visit);
      };
      if (fn.body) ts.forEachChild(fn.body, visit);
    };

    const checkCall = (call: ts.CallExpression): void => {
      const callee = call.expression;
      if (ts.isPropertyAccessExpression(callee) && BANNED_METHODS.has(callee.name.text)) {
        report(call, `banned method: ${callee.name.text}()`);
        return;
      }
      const decl = checker.getResolvedSignature(call)?.getDeclaration();
      if (!decl) return;
      const declFile = decl.getSourceFile();
      if (isOwnSource(declFile, program) && !hasFrameLoopTag(decl)) {
        const name = ts.getNameOfDeclaration(decl)?.getText(declFile) ?? 'function';
        report(call, `calls ${name}, which is not tagged @${TAG}`);
      }
    };

    const find = (node: ts.Node): void => {
      if (isFunctionLike(node) && hasFrameLoopTag(node)) checkBody(node);
      ts.forEachChild(node, find);
    };
    find(file);
  }
  return diagnostics;
}

function collectSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts') && !path.endsWith('.d.ts') && !path.endsWith('.spec.ts'))
        out.push(path);
    }
  };
  for (const base of ['packages', 'test-suite']) {
    for (const pkg of readdirSync(join(root, base), { withFileTypes: true })) {
      if (base === 'test-suite') {
        if (pkg.name === 'src' && pkg.isDirectory()) walk(join(root, base, 'src'));
        continue;
      }
      if (!pkg.isDirectory()) continue;
      const src = join(root, base, pkg.name, 'src');
      try {
        walk(src);
      } catch {
        // The Angular workspace has no src; its code is under projects/.
      }
    }
  }
  const angularProjects = join(root, 'packages', 'angular', 'projects');
  try {
    for (const project of readdirSync(angularProjects)) walk(join(angularProjects, project, 'src'));
  } catch {
    // No Angular projects yet.
  }
  return out;
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, '..');
  const files = process.argv.length > 2 ? process.argv.slice(2) : collectSources(root);
  const diagnostics = lintFrameLoop(files);
  for (const d of diagnostics) {
    console.error(`${relative(root, d.file)}:${d.line}:${d.column} ${d.message}`);
  }
  if (diagnostics.length > 0) {
    console.error(`frame-loop-lint: ${diagnostics.length} problem(s)`);
    process.exit(1);
  }
  console.log(`frame-loop-lint: ${files.length} files clean`);
}
