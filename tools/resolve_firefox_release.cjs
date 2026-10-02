const { execFileSync } = require("node:child_process");

const tag = process.env.RELEASE_TAG;
if (!/^v\d+\.\d+\.\d+$/.test(tag || "")) {
	throw new Error("RELEASE_TAG must look like vX.Y.Z");
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const ref = `refs/tags/${tag}`;
if (git("cat-file", "-t", ref) !== "tag") {
	throw new Error("Release must use an annotated tag");
}
if (git("rev-parse", `${ref}^{commit}`) !== git("rev-parse", "HEAD")) {
	throw new Error("Release tag does not match the checked-out Chrome commit");
}
const annotation = git("for-each-ref", "--format=%(contents)", ref);
const commits = [...annotation.matchAll(/^Firefox-Commit: ([0-9a-f]{40})$/gm)];
if (commits.length !== 1) {
	throw new Error(
		"Release tag must contain exactly one Firefox-Commit: <full SHA> line",
	);
}
const commit = commits[0][1];
if (git("cat-file", "-t", commit) !== "commit") {
	throw new Error("Firefox release reference is not a commit");
}
const manifest = JSON.parse(git("show", `${commit}:manifest.json`));
if (
	manifest.version !== tag.slice(1) ||
	!Array.isArray(manifest.background?.scripts) ||
	manifest.background?.service_worker
) {
	throw new Error("Firefox commit must contain the matching Firefox manifest");
}
process.stdout.write(`commit=${commit}\n`);
