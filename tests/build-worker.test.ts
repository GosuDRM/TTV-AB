import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { collectWorkerSource, embedWorkerBundle, minifyJavaScript } = require(
	resolve(__dirname, "../build/tools/build-worker.js"),
);

describe("worker dependency build", () => {
	it("includes transitive helpers and constants while respecting local shadowing", () => {
		const source = collectWorkerSource(
			`const _offset = 5;
function _leaf(value) { const values = { _offset }; return value + values._offset; }
function _middle(value) { return _leaf(value); }
function _pageOnly() { return document.title; }
function _entry(seed) {
    const _pageOnly = () => "worker";
    self.result = [_middle(seed.value), _pageOnly()];
}`,
			"_entry",
		);
		const scope = { self: {}, _TTVAB_WORKER_SEED: { value: 3 } };
		runInContext(source, createContext(scope));
		expect(scope.self).toEqual({ result: [8, "worker"] });
		expect(source).not.toContain("document");
	});

	it("removes page-only branches before collecting dependencies", () => {
		const source = collectWorkerSource(
			`function _pageOnly() { return document.title; }
function _entry() {
    if (typeof window !== "undefined") _pageOnly();
    else self.result = "worker";
}`,
			"_entry",
		);
		expect(source).not.toContain("_pageOnly");
		const scope = { self: {}, _TTVAB_WORKER_SEED: {} };
		runInContext(source, createContext(scope));
		expect(scope.self).toEqual({ result: "worker" });
	});

	it.each(["_missingHelper()", "document.title"])(
		"fails the build for unavailable worker dependency %s",
		(expression) => {
			expect(() =>
				collectWorkerSource(
					`function _entry() { self.result = ${expression}; }`,
					"_entry",
				),
			).toThrow("Unresolved worker dependencies");
		},
	);

	it("retains recursive helper dependencies without duplicating declarations", () => {
		const source = collectWorkerSource(
			`function _even(n) { return n === 0 || _odd(n - 1); }
function _odd(n) { return n !== 0 && _even(n - 1); }
function _entry() { self.result = _even(4); }`,
			"_entry",
		);
		const scope = { self: {}, _TTVAB_WORKER_SEED: {} };
		runInContext(source, createContext(scope));
		expect(scope.self).toEqual({ result: true });
		expect(source.match(/function _even\(/g)).toHaveLength(1);
		expect(source.match(/function _odd\(/g)).toHaveLength(1);
	});

	it("embeds source as data without interpreting template or placeholder text", () => {
		const worker = 'self.text = `quote " ${data} \\ path`;';
		const source = embedWorkerBundle(
			'const _PLAYBACK_WORKER_SOURCE = "__TTVAB_BUILT_WORKER_SOURCE__"; self.result = _PLAYBACK_WORKER_SOURCE;',
			worker,
		);
		const scope = { self: {} };
		runInContext(source, createContext(scope));
		expect(scope.self).toEqual({ result: worker });
		expect(() => embedWorkerBundle("", worker)).toThrow("placeholder");
	});
});

it("minifies syntax without changing strings, regular expressions, or template text", () => {
	const source = [
		'function _init() { return "_init /** literal */"; }',
		"self.result = [_init(), /^_init$/u.test('_init'), `first",
		"// retained template line",
		"last`];",
	].join("\n");
	const original = { self: {} };
	const minified = { self: {} };
	runInContext(source, createContext(original));
	runInContext(minifyJavaScript(source), createContext(minified));
	expect(minified.self).toEqual(original.self);
});
