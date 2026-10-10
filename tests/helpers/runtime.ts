import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadModule(modulePath: string, preserveFunctionNames = false) {
	const js = readFileSync(resolve(__dirname, "..", modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(
			/^(async\s+)?function (_\w+)/gm,
			preserveFunctionNames
				? "globalThis.$2 = $1function $2"
				: "globalThis.$2 = $1function",
		);
	new Function("globalThis", js)(globalThis);
}

export function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

export function snapshotGlobals(names: readonly string[]): () => void {
	const descriptors = names.map(
		(name) =>
			[name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
	);
	return () => {
		for (const [name, descriptor] of descriptors) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete (globalThis as Record<string, unknown>)[name];
		}
	};
}
