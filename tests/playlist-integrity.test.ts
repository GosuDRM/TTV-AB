import { createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = ["constants", "state", "parser", "api", "processor", "hooks"]
	.map((name) =>
		readFileSync(resolve(__dirname, `../dist/src/modules/${name}.js`), "utf8"),
	)
	.join("\n");
const nativeUrl = "https://edge.example/native.m3u8";
const codec = "avc1.64002a,mp4a.40.2";

function setup() {
	const context = createContext({
		URL,
		Response,
		Request,
		Headers,
		EventTarget,
		Event,
		AbortController,
		DOMException,
		setTimeout,
		clearTimeout,
		performance,
		Date,
		postMessage: vi.fn(),
		navigator: { languages: ["en-US"], language: "en-US" },
	});
	context.self = context;
	runInContext(source, context);
	runInContext(
		`
		_declareState(globalThis);
		_log = () => {};
		globalThis.state = __TTVAB_STATE__;
		state.PageMediaKey = "live:testchannel";
		state.PageChannel = "testchannel";
		state.PageMediaType = "live";
		state.DisableAutoplayBackup = true;
		globalThis.info = _createStreamInfo({ MediaType: "live", ChannelName: "testchannel" });
		state.StreamInfos[info.MediaKey] = info;
	`,
		context,
	);
	const { info, state } = context;
	info.UsherBaseUrl =
		"https://usher.ttvnw.net/api/channel/hls/testchannel.m3u8";
	info.EncodingsM3U8 = `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${codec}"\n${nativeUrl}`;
	info.Urls[nativeUrl] = { Resolution: "1920x1080", Codecs: codec };
	info.ResolutionList = [info.Urls[nativeUrl]];
	state.StreamInfosByUrl[nativeUrl] = info;
	return { context, info, state };
}

const encryptedPlaylist = [
	"#EXTM3U",
	"#EXT-X-TARGETDURATION:2",
	"#EXT-X-MEDIA-SEQUENCE:100",
	'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key"',
	"#EXTINF:2.000,live",
	"https://edge.example/clean-100.ts",
	"#EXTINF:2.000,stitched-ad",
	"https://edge.example/stitched-ad-101.ts",
	"#EXTINF:2.000,live",
	"https://edge.example/clean-102.ts",
].join("\n");

describe("encrypted ad removal", () => {
	it.each(["\n", "\r\n"])(
		"retains decryptable clean media through the real processor (%j)",
		async (newline) => {
			const { context } = setup();
			context._findBackupStream = async () => ({ type: null, m3u8: null });
			const output = await context._processM3U8(
				nativeUrl,
				encryptedPlaylist.replaceAll("\n", newline),
				async () => new Response("", { status: 403 }),
			);
			expect(output).not.toContain("stitched-ad-101.ts");
			expect(output).toContain("clean-102.ts");
			expect(output).toContain("#EXT-X-VERSION:2");
			const ivs = [...output.matchAll(/IV=0x([0-9a-f]{32})/g)];
			expect(ivs).toHaveLength(2);
			const key = Buffer.alloc(16, 7);
			const plain = Buffer.from(
				"clean media must decrypt to the original bytes",
			);
			for (const [index, sequence] of [100, 102].entries()) {
				const iv = Buffer.alloc(16);
				iv.writeUInt32BE(sequence, 12);
				const cipher = createCipheriv("aes-128-cbc", key, iv);
				const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
				const decipher = createDecipheriv(
					"aes-128-cbc",
					key,
					Buffer.from(ivs[index][1], "hex"),
				);
				expect(
					Buffer.concat([decipher.update(encrypted), decipher.final()]),
				).toEqual(plain);
			}
		},
	);

	it.each([
		'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key-two",IV=0x000000000000000000000000000000ff',
		"#EXT-X-KEY:METHOD=NONE",
	])("preserves explicit IVs and key removal after an ad: %s", (key) => {
		const { context, info } = setup();
		const input = encryptedPlaylist.replace(
			"#EXTINF:2.000,live\nhttps://edge.example/clean-102.ts",
			`${key}\n#EXTINF:2.000,live\nhttps://edge.example/clean-102.ts`,
		);
		const output = context._stripAds(input, false, info);
		expect(output).toContain(
			`${key}\n#EXTINF:2.000,live\nhttps://edge.example/clean-102.ts`,
		);
		expect(output).not.toContain("stitched-ad-101.ts");
	});

	it("uses original sequence numbers through skipped entries, key rotation and parts", () => {
		const { context, info } = setup();
		const input = encryptedPlaylist
			.replace(
				"#EXT-X-MEDIA-SEQUENCE:100",
				"#EXT-X-MEDIA-SEQUENCE:95\n#EXT-X-SKIP:SKIPPED-SEGMENTS=5",
			)
			.replace(
				"#EXTINF:2.000,live\nhttps://edge.example/clean-102.ts",
				[
					'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key-two"',
					'#EXT-X-PART:DURATION=0.5,URI="https://edge.example/part-102.ts"',
					"#EXTINF:2.000,live",
					"https://edge.example/clean-102.ts",
				].join("\n"),
			);
		const output = context._stripAds(input, false, info);
		expect(output).toContain(
			'URI="https://edge.example/key-two",IV=0x00000000000000000000000000000066\n#EXT-X-PART',
		);
		expect(output).toContain(
			'URI="https://edge.example/key-two",IV=0x00000000000000000000000000000066\nhttps://edge.example/clean-102.ts',
		);
	});

	it("honors a key change between EXTINF and the retained media URI", () => {
		const { context, info } = setup();
		const input = encryptedPlaylist.replace(
			"https://edge.example/clean-102.ts",
			'#EXT-X-KEY:METHOD=AES-128,URI="https://edge.example/key-two"\nhttps://edge.example/clean-102.ts',
		);
		const output = context._stripAds(input, false, info);
		expect(output).toContain(
			'URI="https://edge.example/key-two",IV=0x00000000000000000000000000000066\nhttps://edge.example/clean-102.ts',
		);
	});

	it("leaves clean encrypted playlists unchanged", async () => {
		const { context } = setup();
		const input = encryptedPlaylist.replaceAll("stitched-ad", "live");
		expect(await context._processM3U8(nativeUrl, input, vi.fn())).toBe(input);
	});
});

function redirectedResponse(body: string, url: string) {
	const response = new Response(body);
	Object.defineProperties(response, {
		url: { value: url },
		redirected: { value: true },
	});
	return response;
}

describe("redirected backup playlists", () => {
	it.each(["site", "autoplay"])(
		"resolves %s segments, keys and maps from the final media URL",
		async (type) => {
			const { context, info, state } = setup();
			state.DisableAutoplayBackup = false;
			state.CurrentAdMediaKey = info.MediaKey;
			const original = "https://edge.example/original/media.m3u8";
			const final = "https://cdn.example/session/media.m3u8";
			Object.assign(info, {
				IsShowingAd: true,
				VisibleAdStartedAt: Date.now() - 1000,
				ActiveBackupPlayerType: type,
				LastCleanBackupPlayerType: type,
			});
			info.BackupEncodingsM3U8Cache[type] = {
				m3u8: `#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${codec}"\n${original}`,
				baseUrl: info.UsherBaseUrl,
			};
			const body =
				'#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.000,live\nsegment.ts';
			const fetch = vi.fn(async () => redirectedResponse(body, final));
			const response = await context._fetchWithTimeout(fetch, original);
			expect(response.url).toBe(final);
			expect(response.redirected).toBe(true);
			const output =
				type === "autoplay"
					? await context._refreshHeldAutoplayBackupPlaylist(info, fetch)
					: await context._refreshActiveBackupMediaPlaylist(info, fetch);
			for (const file of ["segment.ts", "key.bin", "init.mp4"]) {
				expect(output).toContain(new URL(file, final).href);
			}
			expect(info.BackupPlaylistMetadata.get(output).playlistUrl).toBe(
				original,
			);
			const reject = async () =>
				redirectedResponse(body.replace("segment.ts", "stitched-ad.ts"), final);
			expect(
				await context._refreshActiveBackupMediaPlaylist(info, reject),
			).toBeNull();
		},
	);

	it("uses the effective master URL to acquire a relative backup variant", async () => {
		const { context, info, state } = setup();
		const logs: string[] = [];
		context._log = (message: string) => logs.push(message);
		state.BackupPlayerTypes = ["site"];
		state.CurrentAdMediaKey = info.MediaKey;
		state.DisableAdSpoofing = true;
		info.IsShowingAd = true;
		info.VisibleAdStartedAt = Date.now() - 1000;
		const requested: string[] = [];
		const fetch = vi.fn(async (input: string) => {
			const url = String(input);
			requested.push(url);
			if (url.includes("gql.twitch.tv")) {
				return Response.json({
					data: {
						streamPlaybackAccessToken: { signature: "test", value: "site" },
					},
				});
			}
			if (url.includes("usher.ttvnw.net")) {
				return redirectedResponse(
					`#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1920x1080,CODECS="${codec}"\nrelative.m3u8`,
					"https://cdn.example/session/master.m3u8",
				);
			}
			return redirectedResponse(
				"#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2.000,live\nsegment.ts",
				"https://cdn.example/media/playlist.m3u8",
			);
		});
		const output = await context._findBackupStream(
			info,
			fetch,
			0,
			info.ResolutionList[0],
		);
		expect(output.m3u8, JSON.stringify({ requested, logs })).toContain(
			"https://cdn.example/media/segment.ts",
		);
		expect(requested).toContain("https://cdn.example/session/relative.m3u8");
	});
});
