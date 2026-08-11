import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const g = globalThis as Record<string, unknown>;

function loadModule(modulePath: string) {
	const js = readFileSync(resolve(__dirname, modulePath), "utf8")
		.replace(/^"use strict";\s*/m, "")
		.replace(/^const (_\w+|_C|_S)\s*=/gm, "globalThis.$1 =")
		.replace(/^let\s+(_\w+)/gm, "globalThis.$1")
		.replace(/^(async\s+)?function (_\w+)/gm, "globalThis.$2 = $1function");
	new Function("globalThis", js)(globalThis);
}

beforeAll(() => {
	loadModule("../dist/src/modules/constants.js");
	loadModule("../dist/src/modules/logger.js");
});

function T<T>(name: string): T {
	const fn = (globalThis as Record<string, unknown>)[name];
	if (typeof fn !== "function") throw new Error(`${name} not loaded`);
	return fn as T;
}

function makeWorkerLogger(
	styles: unknown = (g._C as Record<string, unknown>).LOG_STYLES,
	workerConsole: Record<string, unknown> = {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
) {
	const messages: unknown[] = [];
	const workerScope = {
		postMessage(message: unknown) {
			messages.push(message);
		},
	};
	const factory = new Function(
		"_C",
		"self",
		"console",
		"window",
		"globalThis",
		`
			let _debugLogging = false;
			const _formatLogText = ${T<(...args: unknown[]) => string>("_formatLogText").toString()};
			const _log = ${T<(...args: unknown[]) => void>("_log").toString()};
			return {
				log: _log,
			};
		`,
	);
	const logger = factory(
		{ LOG_STYLES: styles },
		workerScope,
		workerConsole,
		undefined,
		workerScope,
	) as {
		log: (message: unknown, level?: unknown) => void;
	};
	return { logger, messages, workerConsole };
}

describe("_log (worker-safe debug flag)", () => {
	const log = () => T<(msg: unknown, type?: string) => void>("_log");
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		g._debugLogging = false;
	});

	it("suppresses debug console output when the flag is undeclared", () => {
		delete g._debugLogging;

		expect(() => log()("worker debug line", "debug")).not.toThrow();
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("still emits non-debug output when the flag is undeclared", () => {
		delete g._debugLogging;

		expect(() => log()("worker info line", "info")).not.toThrow();
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("emits debug output once the flag is enabled", () => {
		g._debugLogging = true;

		log()("debug line", "debug");
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("suppresses debug output while the flag is declared but off", () => {
		g._debugLogging = false;

		log()("debug line", "debug");
		expect(logSpy).not.toHaveBeenCalled();
	});
});

describe("_log capture buffer", () => {
	const log = () => T<(msg: unknown, type?: string) => void>("_log");
	let logSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		delete (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
	});

	afterEach(() => {
		vi.restoreAllMocks();
		g._debugLogging = false;
		delete (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
	});

	function buffer(): Array<Record<string, unknown>> {
		const value = (globalThis as Record<string, unknown>).__TTVAB_LOGS__;
		return Array.isArray(value) ? value : [];
	}

	it("records page-side entries with timestamp, level, and message", () => {
		const before = Date.now();
		log()("Ad blocked! Total: 7", "success");
		const entries = buffer();
		expect(entries.length).toBe(1);
		expect(entries[0].m).toBe("Ad blocked! Total: 7");
		expect(entries[0].l).toBe("success");
		expect(Number(entries[0].t)).toBeGreaterThanOrEqual(before);
		expect(logSpy).toHaveBeenCalledTimes(1);
	});

	it("retains debug entries while suppressing their console output", () => {
		g._debugLogging = false;
		log()("hidden debug", "debug");
		expect(buffer().map((entry) => entry.m)).toContain("hidden debug");
		expect(logSpy).not.toHaveBeenCalled();
	});

	it("records debug entries once debug logging is enabled", () => {
		g._debugLogging = true;
		log()("visible debug", "debug");
		expect(buffer().map((e) => e.m)).toContain("visible debug");
	});

	it("caps the buffer near 1000 entries instead of growing forever", () => {
		for (let i = 0; i < 1300; i++) {
			log()(`line ${i}`, "info");
		}
		const entries = buffer();
		expect(entries.length).toBeLessThanOrEqual(1200);
		expect(entries.length).toBeGreaterThanOrEqual(1000);
		expect(entries[entries.length - 1].m).toBe("line 1299");
	});

	it("recovers when the page clobbers the buffer global", () => {
		(globalThis as Record<string, unknown>).__TTVAB_LOGS__ = "corrupted";
		expect(() => log()("after corruption", "info")).not.toThrow();
		expect(buffer().map((e) => e.m)).toContain("after corruption");
	});

	it("caps source messages before retaining them", () => {
		log()("x".repeat(5000), "info");
		expect(String(buffer().at(-1)?.m)).toHaveLength(4000);
	});

	it("does not throw when console output fails", () => {
		logSpy.mockImplementation(() => {
			throw new Error("console unavailable");
		});

		expect(() => log()("still captured", "info")).not.toThrow();
		expect(buffer().at(-1)?.m).toBe("still captured");
	});

	it("uses a bounded fallback timestamp when the wall clock fails", () => {
		vi.spyOn(Date, "now").mockImplementation(() => {
			throw new Error("clock unavailable");
		});

		expect(() => log()("clock-safe", "info")).not.toThrow();
		expect(buffer().at(-1)).toMatchObject({ t: 0, m: "clock-safe" });
	});

	it("falls back safely when level conversion and style lookup fail", () => {
		const originalConstants = g._C;
		const badLevel = {
			toString() {
				throw new Error("level unavailable");
			},
		};
		g._C = {
			get LOG_STYLES() {
				throw new Error("styles unavailable");
			},
		};

		try {
			expect(() => log()("safe fallback", badLevel as never)).not.toThrow();
			expect(buffer().at(-1)).toMatchObject({
				l: "info",
				m: "safe fallback",
			});
		} finally {
			g._C = originalConstants;
		}
	});
});

describe("_formatLogText", () => {
	const format = () => T<(value: unknown) => string>("_formatLogText");

	it("serializes circular and BigInt values without throwing", () => {
		const value: Record<string, unknown> = { count: 7n };
		value.self = value;

		expect(() => format()(value)).not.toThrow();
		expect(format()(value)).toBe('{"count":"7n","self":"[Circular]"}');
	});

	it("survives revoked proxies and values whose string conversion throws", () => {
		const { proxy, revoke } = Proxy.revocable({}, {});
		revoke();
		const throwingValue = {
			toJSON() {
				throw new Error("json unavailable");
			},
			toString() {
				throw new Error("string unavailable");
			},
		};

		expect(() => format()(proxy)).not.toThrow();
		expect(format()(proxy)).toBe("[Unserializable log value]");
		expect(() => format()(throwingValue)).not.toThrow();
		expect(format()(throwingValue)).toContain("[Function]");
	});

	it("bounds object traversal before serialization", () => {
		const value = Array.from({ length: 1000 }, (_, index) => index);
		const untouchedGetter = vi.fn(() => {
			throw new Error("outside traversal budget");
		});
		Object.defineProperty(value, 50, { get: untouchedGetter });

		const output = format()(value);

		expect(untouchedGetter).not.toHaveBeenCalled();
		expect(output).toContain("[976 more items]");
		expect(output.length).toBeLessThanOrEqual(4000);
	});

	it("does not coerce a poisoned array length", () => {
		const coerceLength = vi.fn(() => 1000000);
		const value = new Proxy([], {
			get(target, property, receiver) {
				if (property === "length") return { valueOf: coerceLength };
				return Reflect.get(target, property, receiver);
			},
		});

		expect(format()(value)).toBe("[]");
		expect(coerceLength).not.toHaveBeenCalled();
	});

	it("redacts signed URLs, headers, cookies, and bearer credentials", () => {
		const source = [
			"https://video.example/live.m3u8?sig=signature-secret&token=token-secret&allow_source=true",
			"Authorization: Bearer bearer-secret Client-Integrity: integrity-secret",
			"Cookie: auth=auth-secret; session=session-secret",
		].join("\n");
		const output = format()(source);

		expect(output).toContain(
			"?sig=[redacted]&token=[redacted]&allow_source=true",
		);
		expect(output).toContain("Authorization: [redacted]");
		expect(output).toContain("Client-Integrity: [redacted]");
		expect(output).toContain("Cookie: [redacted]");
		for (const secret of [
			"signature-secret",
			"token-secret",
			"bearer-secret",
			"integrity-secret",
			"auth-secret",
			"session-secret",
		]) {
			expect(output).not.toContain(secret);
		}
	});

	it("caps formatted output at 4000 characters", () => {
		expect(format()("x".repeat(5000))).toHaveLength(4000);
	});
});

describe("_log worker context", () => {
	it("retains bounded redacted debug entries without printing them", () => {
		const { logger, messages, workerConsole } = makeWorkerLogger();
		const source = `https://edge.example/live.m3u8?token=worker-secret&sig=signature-secret ${"x".repeat(5000)}`;

		expect(() => logger.log(source, "debug")).not.toThrow();
		expect(messages).toHaveLength(1);
		const entry = (
			messages[0] as {
				message: { value: Record<string, unknown> };
			}
		).message.value;
		expect(entry.l).toBe("debug");
		expect(String(entry.m).length).toBeLessThanOrEqual(4000);
		expect(String(entry.m)).toContain("token=[redacted]");
		expect(String(entry.m)).toContain("sig=[redacted]");
		expect(String(entry.m)).not.toContain("worker-secret");
		expect(workerConsole.log).not.toHaveBeenCalled();
	});

	it("does not throw when worker style or console access fails", () => {
		const throwingConsole = new Proxy(
			{},
			{
				get() {
					throw new Error("console unavailable");
				},
			},
		);
		const throwingStyles = new Proxy(
			{},
			{
				get() {
					throw new Error("styles unavailable");
				},
			},
		);
		const { logger, messages } = makeWorkerLogger(
			throwingStyles,
			throwingConsole,
		);

		expect(() => logger.log("worker survives", "info")).not.toThrow();
		expect(messages).toHaveLength(1);
	});
});
