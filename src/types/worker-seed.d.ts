type TTVABWorkerSeed = {
	constants: Record<string, unknown>;
	sharedState: {
		workers: unknown[];
		workerRefs: unknown[];
		adsBlocked: number;
	};
	playbackCodecEntries: [string, string][];
	state: TTVABPlaybackState;
};
