import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { transformSync } from "esbuild";
import ts from "typescript";

export function minifyJavaScript(source: string) {
	return transformSync(source, {
		target: "es2022",
		minifySyntax: true,
		minifyWhitespace: true,
		minifyIdentifiers: false,
		legalComments: "none",
	}).code;
}

function createWorkerProgram(source: string) {
	const fileName = resolve("playback-worker.js");
	const globalsName = resolve("playback-worker-globals.d.ts");
	const options: ts.CompilerOptions = {
		allowJs: true,
		checkJs: true,
		noEmit: true,
		target: ts.ScriptTarget.ES2022,
		lib: ["lib.es2022.d.ts", "lib.webworker.d.ts"],
		types: [],
		skipLibCheck: true,
	};
	const host = ts.createCompilerHost(options);
	const readSourceFile = host.getSourceFile.bind(host);
	host.getSourceFile = (name, languageVersion, ...rest) => {
		if (name === fileName) {
			return ts.createSourceFile(name, source, languageVersion, true);
		}
		if (name === globalsName) {
			return ts.createSourceFile(
				name,
				"declare const __TTVAB_STATE__: any; declare const _TTVAB_WORKER_SEED: any;",
				languageVersion,
				true,
			);
		}
		return readSourceFile(name, languageVersion, ...rest);
	};
	const program = ts.createProgram([fileName, globalsName], options, host);
	return { program, sourceFile: program.getSourceFile(fileName) };
}

export function collectWorkerSource(source: string, entry: string) {
	const prepared = transformSync(source, {
		target: "es2022",
		define: { window: "undefined" },
		minifySyntax: true,
		legalComments: "none",
	}).code;
	const { program, sourceFile } = createWorkerProgram(prepared);
	const checker = program.getTypeChecker();
	const declarations = new Map<
		ts.Symbol,
		ts.FunctionDeclaration | ts.VariableDeclaration
	>();
	const overrides = new Map([
		["_C", "const _C = _TTVAB_WORKER_SEED.constants;"],
		["_S", "const _S = _TTVAB_WORKER_SEED.sharedState;"],
		[
			"_pageSideVariantCodecByUrl",
			"const _pageSideVariantCodecByUrl = new Map(_TTVAB_WORKER_SEED.playbackCodecEntries);",
		],
	]);
	for (const statement of sourceFile.statements) {
		if (ts.isFunctionDeclaration(statement) && statement.name) {
			declarations.set(checker.getSymbolAtLocation(statement.name), statement);
		} else if (ts.isVariableStatement(statement)) {
			for (const declaration of statement.declarationList.declarations) {
				if (!ts.isIdentifier(declaration.name)) {
					throw new Error(
						"Worker source requires named top-level declarations",
					);
				}
				declarations.set(
					checker.getSymbolAtLocation(declaration.name),
					declaration,
				);
			}
		}
	}
	const root = [...declarations].find(
		([, node]) => node.name.getText(sourceFile) === entry,
	)?.[0];
	if (!root) throw new Error(`Worker entry is missing: ${entry}`);
	const included = new Set<ts.Symbol>();
	const include = (symbol: ts.Symbol) => {
		if (included.has(symbol)) return;
		const declaration = declarations.get(symbol);
		if (!declaration) return;
		included.add(symbol);
		if (overrides.has(declaration.name.getText(sourceFile))) return;
		const visit = (node: ts.Node) => {
			if (ts.isIdentifier(node)) {
				include(
					ts.isShorthandPropertyAssignment(node.parent)
						? checker.getShorthandAssignmentValueSymbol(node.parent)
						: checker.getSymbolAtLocation(node),
				);
			}
			ts.forEachChild(node, visit);
		};
		visit(declaration);
	};
	include(root);
	const printer = ts.createPrinter({ removeComments: true });
	const output: string[] = [];
	for (const [symbol, declaration] of declarations) {
		if (!included.has(symbol)) continue;
		const name = declaration.name.getText(sourceFile);
		if (overrides.has(name)) {
			output.push(overrides.get(name));
		} else if (ts.isVariableDeclaration(declaration)) {
			const statement = ts.factory.createVariableStatement(
				undefined,
				ts.factory.createVariableDeclarationList(
					[declaration],
					(declaration.parent as ts.VariableDeclarationList).flags,
				),
			);
			output.push(
				printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile),
			);
		} else {
			output.push(declaration.getText(sourceFile));
		}
	}
	const workerSource = `${output.join("\n")}\n${entry}(_TTVAB_WORKER_SEED);`;
	const checked = createWorkerProgram(workerSource);
	const missing = checked.program
		.getSemanticDiagnostics(checked.sourceFile)
		.filter((diagnostic) =>
			[2304, 2552, 2580, 2584, 2591, 2592, 18004].includes(diagnostic.code),
		);
	if (missing.length) {
		throw new Error(
			`Unresolved worker dependencies: ${missing.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")).join("; ")}`,
		);
	}
	return workerSource;
}

export function buildWorkerBundle(modulesDir: string, moduleOrder: string[]) {
	const source = [...moduleOrder, "worker-entry.js"]
		.map((name) => readFileSync(resolve(modulesDir, name), "utf8"))
		.join("\n");
	const workerSource = collectWorkerSource(source, "_startPlaybackWorker");
	return { source: workerSource, code: minifyJavaScript(workerSource) };
}

export function embedWorkerBundle(source: string, worker: string) {
	const parsed = ts.createSourceFile(
		"hooks.js",
		source,
		ts.ScriptTarget.ES2022,
		true,
	);
	const declarations = parsed.statements
		.filter(ts.isVariableStatement)
		.flatMap((statement) => [...statement.declarationList.declarations])
		.filter(
			(declaration) =>
				declaration.name.getText(parsed) === "_PLAYBACK_WORKER_SOURCE",
		);
	const value = declarations[0]?.initializer;
	if (
		declarations.length !== 1 ||
		!value ||
		!ts.isStringLiteral(value) ||
		value.text !== "__TTVAB_BUILT_WORKER_SOURCE__"
	) {
		throw new Error("Worker source placeholder is missing or ambiguous");
	}
	return (
		source.slice(0, value.getStart(parsed)) +
		JSON.stringify(worker) +
		source.slice(value.end)
	);
}
