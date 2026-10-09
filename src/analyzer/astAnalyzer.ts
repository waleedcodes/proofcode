import * as fs from 'node:fs';
import * as ts from 'typescript';
import { ExportInfo, FileAnalysis, ImportInfo, SymbolInfo, SymbolKind } from '../types';

export class AstAnalyzer {
  /**
   * Analyzes a TypeScript/JavaScript source file and extracts symbols, imports, exports, and API routes.
   */
  public static analyzeFile(filePath: string, content?: string): FileAnalysis {
    const sourceText = content ?? (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '');
    const isJsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      isJsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const symbols: SymbolInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const apiRoutes: FileAnalysis['apiRoutes'] = [];

    const isNextAppRoute = /[\\/]app[\\/].*[\\/]route\.(?:ts|js|tsx|jsx)$/.test(filePath);
    const isNextPagesApiRoute = /[\\/]pages[\\/]api[\\/].*\.(?:ts|js|tsx|jsx)$/.test(filePath);

    const getLineAndColumn = (pos: number) => {
      const lc = sourceFile.getLineAndCharacterOfPosition(pos);
      return { line: lc.line + 1, column: lc.character + 1 };
    };

    const extractCallsFromNode = (node: ts.Node): string[] => {
      const calls: string[] = [];
      const visitCall = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const expression = n.expression;
          if (ts.isIdentifier(expression)) {
            calls.push(expression.text);
          } else if (ts.isPropertyAccessExpression(expression)) {
            calls.push(expression.getText(sourceFile));
            calls.push(expression.name.text);
          }
        }
        ts.forEachChild(n, visitCall);
      };
      ts.forEachChild(node, visitCall);
      return Array.from(new Set(calls));
    };

    const visit = (node: ts.Node) => {
      // 1. Imports
      if (ts.isImportDeclaration(node)) {
        const source = (node.moduleSpecifier as ts.StringLiteral).text;
        const line = getLineAndColumn(node.getStart(sourceFile)).line;
        const specifiers: ImportInfo['specifiers'] = [];

        if (node.importClause) {
          if (node.importClause.name) {
            specifiers.push({
              name: node.importClause.name.text,
              isDefault: true
            });
          }
          if (node.importClause.namedBindings) {
            if (ts.isNamespaceImport(node.importClause.namedBindings)) {
              specifiers.push({
                name: node.importClause.namedBindings.name.text,
                isNamespace: true
              });
            } else if (ts.isNamedImports(node.importClause.namedBindings)) {
              for (const element of node.importClause.namedBindings.elements) {
                specifiers.push({
                  name: element.name.text,
                  propertyName: element.propertyName?.text
                });
              }
            }
          }
        }

        imports.push({ source, specifiers, line });
      }

      // 2. Export Declarations (e.g. export { foo, bar }; export * from './foo')
      if (ts.isExportDeclaration(node)) {
        const line = getLineAndColumn(node.getStart(sourceFile)).line;
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            exports.push({
              name: el.name.text,
              isDefault: false,
              line
            });
          }
        }
      }

      // 3. Functions
      if (ts.isFunctionDeclaration(node) && node.name) {
        const name = node.name.text;
        const start = getLineAndColumn(node.getStart(sourceFile));
        const end = getLineAndColumn(node.getEnd());
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        );
        const isDefault = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
        );
        const calls = extractCallsFromNode(node);

        const sym: SymbolInfo = {
          name,
          kind: 'function',
          filePath,
          startLine: start.line,
          endLine: end.line,
          startColumn: start.column,
          endColumn: end.column,
          isExported,
          isDefaultExport: isDefault,
          calls
        };
        symbols.push(sym);

        if (isExported) {
          exports.push({ name, isDefault, line: start.line });
          if (isNextAppRoute && /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(name)) {
            apiRoutes.push({
              method: name.toUpperCase(),
              path: filePath,
              handlerSymbol: name,
              line: start.line
            });
          }
        }
      }

      // 4. Variable statements (const foo = () => {}, const bar = function() {})
      if (ts.isVariableStatement(node)) {
        const isTopLevel = node.parent === sourceFile;
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        );

        if (isTopLevel) {
          for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const name = decl.name.text;
            const start = getLineAndColumn(decl.getStart(sourceFile));
            const end = getLineAndColumn(decl.getEnd());
            let kind: SymbolKind = 'variable';

            if (decl.initializer) {
              if (ts.isArrowFunction(decl.initializer)) {
                kind = 'arrow_function';
              } else if (ts.isFunctionExpression(decl.initializer)) {
                kind = 'function';
              }
            }

            const calls = decl.initializer ? extractCallsFromNode(decl.initializer) : [];

            symbols.push({
              name,
              kind,
              filePath,
              startLine: start.line,
              endLine: end.line,
              startColumn: start.column,
              endColumn: end.column,
              isExported,
              calls
            });

            if (isExported) {
              exports.push({ name, isDefault: false, line: start.line });
              if (isNextAppRoute && /^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)$/i.test(name)) {
                apiRoutes.push({
                  method: name.toUpperCase(),
                  path: filePath,
                  handlerSymbol: name,
                  line: start.line
                });
              }
            }
          }
        }
      }
    }

      // 5. Classes & Methods
      if (ts.isClassDeclaration(node) && node.name) {
        const className = node.name.text;
        const start = getLineAndColumn(node.getStart(sourceFile));
        const end = getLineAndColumn(node.getEnd());
        const isExported = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        );
        const isDefault = Boolean(
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
        );

        symbols.push({
          name: className,
          kind: 'class',
          filePath,
          startLine: start.line,
          endLine: end.line,
          startColumn: start.column,
          endColumn: end.column,
          isExported,
          isDefaultExport: isDefault,
          calls: []
        });

        if (isExported) {
          exports.push({ name: className, isDefault, line: start.line });
        }

        // Methods within class
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
            const mName = member.name.text;
            const mStart = getLineAndColumn(member.getStart(sourceFile));
            const mEnd = getLineAndColumn(member.getEnd());
            const mCalls = extractCallsFromNode(member);

            symbols.push({
              name: `${className}.${mName}`,
              kind: 'method',
              filePath,
              startLine: mStart.line,
              endLine: mEnd.line,
              startColumn: mStart.column,
              endColumn: mEnd.column,
              isExported,
              parentSymbol: className,
              calls: mCalls
            });
          }
        }
      }

      // 6. Interfaces & Type Aliases
      if (ts.isInterfaceDeclaration(node)) {
