// TTV AB - UI

const _REMINDER_KEY = "ttvab_last_reminder";
const _REMINDER_NEXT_KEY = "ttvab_next_reminder";
const _REMINDER_CADENCE_KEY = "ttvab_reminder_cadence";
const _REMINDER_STATE_KEY = "ttvab_reminder_state";
const _REMINDER_DAY_MS = 86400000;
const _REMINDER_BASE_INTERVAL = 14 * _REMINDER_DAY_MS;
const _REMINDER_MAX_INTERVAL = 90 * _REMINDER_DAY_MS;
const _REMINDER_SUPPORTER_INTERVAL = 120 * _REMINDER_DAY_MS;
const _REMINDER_MIN_ADS_BLOCKED = 20;
const _REMINDER_SHOW_DELAY_MS = 5000;
const _REMINDER_RETRY_DELAY_MS = 60000;
const _REMINDER_MAX_ATTEMPTS = 3;
const _FIRST_RUN_KEY = "ttvab_first_run_shown";
const _UI_ICON_SRC =
	"data:image/png;base64,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";
const _UI_FLAGS_KEY = "__TTVAB_UI_FLAGS__";
type UiFlags = {
	achievementListenerInitialized: boolean;
	welcomeScheduled: boolean;
	donationScheduled: boolean;
	donationDelayTimer: ReturnType<typeof setTimeout> | null;
	donationDismissTimer: ReturnType<typeof setTimeout> | null;
	welcomeDelayTimer: ReturnType<typeof setTimeout> | null;
	welcomeDismissTimer: ReturnType<typeof setTimeout> | null;
	achievementDismissTimer: ReturnType<typeof setTimeout> | null;
	achievementRemoveTimer: ReturnType<typeof setTimeout> | null;
};

let _adTimerEnabled = false;

function _setAdTimerEnabled(enabled) {
	_adTimerEnabled = enabled === true;
	_updateAdTimerOverlay();
}

let _adTimerTickTimer: ReturnType<typeof setTimeout> | null = null;
let _adTimerRefreshListening = false;

function _setAdTimerRefreshListening(listening) {
	if (_adTimerRefreshListening === listening) return;
	_adTimerRefreshListening = listening;
	const method = listening ? "addEventListener" : "removeEventListener";
	window[method]("visibilitychange", _updateAdTimerOverlay, true);
	document[method]("fullscreenchange", _updateAdTimerOverlay);
}

function _cancelAdTimerTick() {
	if (_adTimerTickTimer === null) return;
	clearTimeout(_adTimerTickTimer);
	_adTimerTickTimer = null;
}

function _clearAdTimerOverlay() {
	_cancelAdTimerTick();
	_setAdTimerRefreshListening(false);
	try {
		document.getElementById("ttvab-ad-timer")?.remove();
	} catch {}
}

function _updateAdTimerOverlay() {
	try {
		const state = __TTVAB_STATE__;
		const mediaKey = _normalizeMediaKey(state?.CurrentAdMediaKey);
		const cycleStartedAt = Number(
			state?.AdPodProgressByMediaKey?.[mediaKey]?.cycleStartedAt,
		);
		const now = Date.now();
		const adsEndedInHold = Boolean(
			_normalizeMediaKey(state?.LastAdEndedMediaKey) === mediaKey &&
				Number(state?.LastAdEndedCycleStartedAt) === cycleStartedAt &&
				Number(state?.LastAdEndedAt) >= (Number(state?.LastAdDetectedAt) || 0),
		);
		if (
			!_adTimerEnabled ||
			state?.IsAdStrippingEnabled !== true ||
			!mediaKey ||
			mediaKey !== _normalizeMediaKey(state.PageMediaKey) ||
			!Number.isFinite(cycleStartedAt) ||
			cycleStartedAt <= 0 ||
			cycleStartedAt > now ||
			adsEndedInHold ||
			!document.body
		) {
			_clearAdTimerOverlay();
			return;
		}
		const { player, state: playerState } = _getPlayerAndState();
		const content = playerState?.props?.content;
		const playerContext = _normalizePlaybackContext({
			MediaType: content?.type,
			ChannelName: content?.channelLogin,
			VodID: content?.vodID,
		});
		const video = player?.getHTMLVideoElement?.();
		const fullscreen = document.fullscreenElement;
		if (
			playerContext.MediaKey !== mediaKey ||
			!(video instanceof HTMLVideoElement) ||
			!video.isConnected ||
			document.pictureInPictureElement === video ||
			(fullscreen && (fullscreen === video || !fullscreen.contains(video)))
		) {
			_clearAdTimerOverlay();
			return;
		}
		const rect = video.getBoundingClientRect();
		const visibleTop = Math.max(rect.top, 0);
		const visibleBottom = Math.min(rect.bottom, window.innerHeight);
		const visibility = window.getComputedStyle(video).visibility;
		if (
			visibility === "hidden" ||
			visibility === "collapse" ||
			rect.width < 220 ||
			visibleBottom - visibleTop < 80 ||
			visibleTop + 40 > window.innerHeight ||
			rect.right <= 0 ||
			rect.left >= window.innerWidth
		) {
			_clearAdTimerOverlay();
			return;
		}
		let overlay = document.getElementById("ttvab-ad-timer");
		if (!overlay) {
			overlay = document.createElement("div");
			overlay.id = "ttvab-ad-timer";
			overlay.setAttribute("role", "timer");
			overlay.setAttribute("aria-live", "off");
			overlay.style.cssText =
				"position:fixed;z-index:2147483646;pointer-events:none;user-select:none;padding:5px 9px;border-radius:5px;background:rgba(14,14,16,.72);color:#efeff1;font:12px/1.4 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;max-width:calc(100vw - 24px);overflow:hidden";
		}
		const host = fullscreen || document.body;
		if (overlay.parentElement !== host) host.appendChild(overlay);
		overlay.style.top = `${visibleTop + 12}px`;
		const viewportWidth =
			document.documentElement?.clientWidth || window.innerWidth;
		overlay.style.right = `${Math.max(0, viewportWidth - rect.right) + 12}px`;
		const elapsedMs = now - cycleStartedAt;
		const seconds = Math.floor(elapsedMs / 1000);
		const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
		const { localeTag } = _getPageLanguage();
		if (overlay.lang !== localeTag) overlay.lang = localeTag;
		const text = `${_getPageText().adBreak} · ${elapsed}`;
		if (overlay.textContent !== text) overlay.textContent = text;
		_setAdTimerRefreshListening(true);
		_cancelAdTimerTick();
		const hidden =
			typeof _isNativeDocumentHidden === "function"
				? _isNativeDocumentHidden()
				: document.visibilityState === "hidden";
		if (!hidden) {
			_adTimerTickTimer = setTimeout(
				() => {
					_adTimerTickTimer = null;
					_updateAdTimerOverlay();
				},
				1000 - (elapsedMs % 1000) + 20,
			);
		}
	} catch {
		_clearAdTimerOverlay();
	}
}

function _getUiStorageItem(key) {
	try {
		return localStorage.getItem(key);
	} catch (e) {
		_log(`UI storage read error for ${key}: ${e.message}`, "error");
		return null;
	}
}

function _setUiStorageItem(key, value) {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch (e) {
		_log(`UI storage write error for ${key}: ${e.message}`, "error");
		return false;
	}
}

function _getUiFlags(): UiFlags {
	const existing = window[_UI_FLAGS_KEY];
	if (existing && typeof existing === "object") {
		return existing as UiFlags;
	}
	const flags: UiFlags = {
		achievementListenerInitialized: false,
		welcomeScheduled: false,
		donationScheduled: false,
		donationDelayTimer: null,
		donationDismissTimer: null,
		welcomeDelayTimer: null,
		welcomeDismissTimer: null,
		achievementDismissTimer: null,
		achievementRemoveTimer: null,
	};
	window[_UI_FLAGS_KEY] = flags;
	return flags;
}

type ReminderState = {
	nextAt: number;
	shownCount: number;
	supported: boolean;
	baseline: number | null;
	since: number;
};

function _readReminderState(now: number): ReminderState {
	let stored: Partial<ReminderState> | null = null;
	try {
		stored = JSON.parse(_getUiStorageItem(_REMINDER_STATE_KEY) || "null");
	} catch {}
	if (stored && typeof stored === "object" && Number.isFinite(stored.nextAt)) {
		return {
			nextAt: stored.nextAt,
			shownCount: Math.max(0, Math.trunc(Number(stored.shownCount) || 0)),
			supported: stored.supported === true,
			baseline: Number.isFinite(stored.baseline)
				? Math.max(0, Math.trunc(stored.baseline))
				: null,
			since: Number.isFinite(stored.since) ? stored.since : now,
		};
	}
	const supported = _getUiStorageItem(_REMINDER_CADENCE_KEY) === "steady";
	const legacyNextAt = Number.parseInt(
		_getUiStorageItem(_REMINDER_NEXT_KEY) || "",
		10,
	);
	const legacyLastAt = Number.parseInt(
		_getUiStorageItem(_REMINDER_KEY) || "",
		10,
	);
	return {
		nextAt: supported
			? now + _REMINDER_SUPPORTER_INTERVAL
			: Number.isFinite(legacyNextAt)
				? legacyNextAt
				: Number.isFinite(legacyLastAt) && legacyLastAt <= now
					? legacyLastAt + _REMINDER_BASE_INTERVAL
					: now + _REMINDER_BASE_INTERVAL,
		shownCount: 0,
		supported,
		baseline: null,
		since: now,
	};
}

function _writeReminderState(state: ReminderState) {
	_setUiStorageItem(_REMINDER_STATE_KEY, JSON.stringify(state));
}

function _getReminderIntervalMs(state: ReminderState) {
	if (state.supported) return _REMINDER_SUPPORTER_INTERVAL;
	return Math.min(
		_REMINDER_BASE_INTERVAL * 2 ** state.shownCount,
		_REMINDER_MAX_INTERVAL,
	);
}

function _isReminderMomentQuiet() {
	const hidden =
		typeof _isNativeDocumentHidden === "function"
			? _isNativeDocumentHidden()
			: document.visibilityState === "hidden";
	return Boolean(
		document.body &&
			!hidden &&
			!document.fullscreenElement &&
			!document.getElementById("ttvab-worker-recovery") &&
			!__TTVAB_STATE__?.CurrentAdMediaKey,
	);
}

const _PAGE_TEXT = {
	en: {
		unhooked:
			"Refresh this tab to start ad blocking on the current player. Chat will reconnect and picture-in-picture will close.",
		postAd:
			"Playback did not recover after ads. Refresh this tab to restart the stream. Chat will reconnect and picture-in-picture will close.",
		crash:
			"TTV AB could not restart Twitch's player worker. If playback remains stuck, refresh this tab. Chat will reconnect and picture-in-picture will close.",
		refresh: "Refresh tab",
		dismiss: "Dismiss",
		welcomePill: "Active",
		adBreak: "Ad break",
		welcomeTitle: "You're all set",
		welcomeBody:
			"Ads on Twitch streams and VODs are now blocked automatically, with nothing to configure.",
		pinTitle: "Pin for quick access",
		pinBody: "Click the 🧩 toolbar menu, find TTV AB, then hit the pin.",
		donationPill: "💜 Free",
		donationTitle: "Enjoying ad-free Twitch?",
		donationBody:
			"TTV AB has blocked {count} ads for you since {date}. It's free and built by one person, so if it keeps the ads away, consider fueling development with a coffee.",
		donationButton: "☕ Support the Developer",
		achievementUnlocked: "Achievement Unlocked!",
	},
	es: {
		unhooked:
			"Actualiza esta pestaña para empezar a bloquear anuncios en el reproductor actual. El chat se volverá a conectar y se cerrará el modo imagen en imagen.",
		postAd:
			"La reproducción no se recuperó después de los anuncios. Actualiza esta pestaña para reiniciar la transmisión. El chat se volverá a conectar y se cerrará el modo imagen en imagen.",
		crash:
			"TTV AB no pudo reiniciar el proceso del reproductor de Twitch. Si la reproducción sigue atascada, actualiza esta pestaña. El chat se volverá a conectar y se cerrará el modo imagen en imagen.",
		refresh: "Actualizar pestaña",
		dismiss: "Descartar",
		welcomePill: "Activo",
		adBreak: "Pausa publicitaria",
		welcomeTitle: "Todo listo",
		welcomeBody:
			"Los anuncios en directos y VOD de Twitch ahora se bloquean automáticamente, sin necesidad de configurar nada.",
		pinTitle: "Fíjalo para acceder rápido",
		pinBody:
			"Haz clic en el menú 🧩 de la barra de herramientas, busca TTV AB y haz clic en el icono de fijar.",
		donationPill: "💜 Gratis",
		donationTitle: "¿Disfrutas de Twitch sin anuncios?",
		donationBody:
			"TTV AB ha bloqueado {count} anuncios para ti desde el {date}. Es gratis y lo desarrolla una sola persona, así que si te libra de los anuncios, considera apoyar su desarrollo con un café.",
		donationButton: "☕ Apoyar al desarrollador",
		achievementUnlocked: "¡Logro desbloqueado!",
	},
	fr: {
		unhooked:
			"Actualisez cet onglet pour bloquer les publicités dans le lecteur actuel. Le chat se reconnectera et le mode image dans l’image se fermera.",
		postAd:
			"La lecture n’a pas repris après les publicités. Actualisez cet onglet pour relancer le stream. Le chat se reconnectera et le mode image dans l’image se fermera.",
		crash:
			"TTV AB n’a pas pu redémarrer le processus du lecteur Twitch. Si la lecture reste bloquée, actualisez cet onglet. Le chat se reconnectera et le mode image dans l’image se fermera.",
		refresh: "Actualiser l’onglet",
		dismiss: "Ignorer",
		welcomePill: "Actif",
		adBreak: "Coupure pub",
		welcomeTitle: "Tout est prêt",
		welcomeBody:
			"Les publicités des streams et des VOD Twitch sont désormais bloquées automatiquement, sans aucun réglage.",
		pinTitle: "Épinglez-le pour un accès rapide",
		pinBody:
			"Cliquez sur le menu 🧩 de la barre d’outils, trouvez TTV AB, puis cliquez sur l’épingle.",
		donationPill: "💜 Gratuit",
		donationTitle: "Vous profitez de Twitch sans pub ?",
		donationBody:
			"TTV AB a bloqué {count} publicités pour vous depuis le {date}. Il est gratuit et développé par une seule personne : s’il vous débarrasse des pubs, pensez à soutenir son développement en offrant un café.",
		donationButton: "☕ Soutenir le développeur",
		achievementUnlocked: "Succès débloqué !",
	},
	de: {
		unhooked:
			"Lade diesen Tab neu, um Werbung im aktuellen Player zu blockieren. Der Chat verbindet sich neu und Bild-in-Bild wird geschlossen.",
		postAd:
			"Die Wiedergabe hat sich nach der Werbung nicht erholt. Lade diesen Tab neu, um den Stream neu zu starten. Der Chat verbindet sich neu und Bild-in-Bild wird geschlossen.",
		crash:
			"TTV AB konnte den Player-Prozess von Twitch nicht neu starten. Wenn die Wiedergabe hängen bleibt, lade diesen Tab neu. Der Chat verbindet sich neu und Bild-in-Bild wird geschlossen.",
		refresh: "Tab neu laden",
		dismiss: "Schließen",
		welcomePill: "Aktiv",
		adBreak: "Werbepause",
		welcomeTitle: "Alles bereit",
		welcomeBody:
			"Werbung in Twitch-Streams und VODs wird jetzt automatisch blockiert, ohne dass du etwas einstellen musst.",
		pinTitle: "Für schnellen Zugriff anheften",
		pinBody:
			"Klicke in der Symbolleiste auf das 🧩-Menü, suche TTV AB und klicke auf das Stecknadel-Symbol.",
		donationPill: "💜 Kostenlos",
		donationTitle: "Gefällt dir Twitch ohne Werbung?",
		donationBody:
			"TTV AB hat seit dem {date} {count} Werbeanzeigen für dich blockiert. Es ist kostenlos und wird von einer einzelnen Person entwickelt. Wenn es dir die Werbung vom Leib hält, unterstütze die Entwicklung doch mit einem Kaffee.",
		donationButton: "☕ Entwickler unterstützen",
		achievementUnlocked: "Erfolg freigeschaltet!",
	},
	pt: {
		unhooked:
			"Atualize esta aba para começar a bloquear anúncios no player atual. O chat vai reconectar e o picture-in-picture será fechado.",
		postAd:
			"A reprodução não se recuperou depois dos anúncios. Atualize esta aba para reiniciar a transmissão. O chat vai reconectar e o picture-in-picture será fechado.",
		crash:
			"O TTV AB não conseguiu reiniciar o processo do player da Twitch. Se a reprodução continuar travada, atualize esta aba. O chat vai reconectar e o picture-in-picture será fechado.",
		refresh: "Atualizar aba",
		dismiss: "Dispensar",
		welcomePill: "Ativo",
		adBreak: "Intervalo de anúncios",
		welcomeTitle: "Tudo pronto",
		welcomeBody:
			"Os anúncios em transmissões e VODs da Twitch agora são bloqueados automaticamente, sem nada para configurar.",
		pinTitle: "Fixe para acesso rápido",
		pinBody:
			"Clique no menu 🧩 da barra de ferramentas, encontre o TTV AB e clique no alfinete.",
		donationPill: "💜 Grátis",
		donationTitle: "Curtindo a Twitch sem anúncios?",
		donationBody:
			"O TTV AB bloqueou {count} anúncios para você desde {date}. Ele é gratuito e feito por uma única pessoa. Se está mantendo os anúncios longe, considere apoiar o desenvolvimento com um café.",
		donationButton: "☕ Apoiar o desenvolvedor",
		achievementUnlocked: "Conquista desbloqueada!",
	},
	it: {
		unhooked:
			"Aggiorna questa scheda per bloccare la pubblicità nel player attuale. La chat si riconnetterà e il picture-in-picture verrà chiuso.",
		postAd:
			"La riproduzione non è ripresa dopo la pubblicità. Aggiorna questa scheda per riavviare la diretta. La chat si riconnetterà e il picture-in-picture verrà chiuso.",
		crash:
			"TTV AB non è riuscito a riavviare il processo del player di Twitch. Se la riproduzione resta bloccata, aggiorna questa scheda. La chat si riconnetterà e il picture-in-picture verrà chiuso.",
		refresh: "Aggiorna scheda",
		dismiss: "Chiudi",
		welcomePill: "Attivo",
		adBreak: "Pausa pubblicitaria",
		welcomeTitle: "È tutto pronto",
		welcomeBody:
			"Le pubblicità nelle dirette e nei VOD di Twitch ora vengono bloccate automaticamente, senza dover configurare nulla.",
		pinTitle: "Fissala per un accesso rapido",
		pinBody:
			"Fai clic sul menu 🧩 della barra degli strumenti, trova TTV AB e premi la puntina.",
		donationPill: "💜 Gratis",
		donationTitle: "Ti piace Twitch senza pubblicità?",
		donationBody:
			"TTV AB ha bloccato {count} pubblicità per te dal {date}. È gratuito e sviluppato da una sola persona: se tiene lontana la pubblicità, valuta di sostenerne lo sviluppo offrendo un caffè.",
		donationButton: "☕ Sostieni lo sviluppatore",
		achievementUnlocked: "Obiettivo sbloccato!",
	},
	ja: {
		unhooked:
			"このタブを再読み込みすると、現在のプレイヤーで広告ブロックが始まります。チャットは再接続され、ピクチャー・イン・ピクチャーは閉じます。",
		postAd:
			"広告の後に再生が回復しませんでした。このタブを再読み込みして配信を再開してください。チャットは再接続され、ピクチャー・イン・ピクチャーは閉じます。",
		crash:
			"TTV AB は Twitch のプレイヤー処理を再起動できませんでした。再生が止まったままの場合は、このタブを再読み込みしてください。チャットは再接続され、ピクチャー・イン・ピクチャーは閉じます。",
		refresh: "タブを再読み込み",
		dismiss: "閉じる",
		welcomePill: "有効",
		adBreak: "広告ブレイク",
		welcomeTitle: "準備完了です",
		welcomeBody:
			"Twitch の配信と VOD の広告が自動でブロックされるようになりました。設定は不要です。",
		pinTitle: "ピン留めですぐにアクセス",
		pinBody:
			"ツールバーの 🧩 メニューをクリックし、TTV AB を探してピンのアイコンをクリックしてください。",
		donationPill: "💜 無料",
		donationTitle: "広告なしの Twitch を楽しんでいますか？",
		donationBody:
			"TTV AB は{date}以降、{count}件の広告をブロックしました。この拡張機能は無料で、個人で開発しています。広告ブロックに満足していただけたら、コーヒー1杯分の支援をご検討ください。",
		donationButton: "☕ 開発者を支援",
		achievementUnlocked: "実績を解除しました！",
	},
	ko: {
		unhooked:
			"이 탭을 새로 고치면 현재 플레이어에서 광고 차단이 시작됩니다. 채팅이 다시 연결되고 PIP 모드가 닫힙니다.",
		postAd:
			"광고 후 재생이 복구되지 않았습니다. 이 탭을 새로 고쳐 방송을 다시 시작하세요. 채팅이 다시 연결되고 PIP 모드가 닫힙니다.",
		crash:
			"TTV AB가 Twitch 플레이어 프로세스를 다시 시작하지 못했습니다. 재생이 계속 멈춰 있으면 이 탭을 새로 고치세요. 채팅이 다시 연결되고 PIP 모드가 닫힙니다.",
		refresh: "탭 새로 고침",
		dismiss: "닫기",
		welcomePill: "활성",
		adBreak: "광고 구간",
		welcomeTitle: "준비 완료",
		welcomeBody:
			"이제 Twitch 방송과 VOD의 광고가 자동으로 차단됩니다. 따로 설정할 필요가 없습니다.",
		pinTitle: "고정해서 빠르게 사용하기",
		pinBody:
			"툴바의 🧩 메뉴를 클릭하고 TTV AB를 찾은 다음 고정 아이콘을 누르세요.",
		donationPill: "💜 무료",
		donationTitle: "광고 없는 Twitch, 마음에 드시나요?",
		donationBody:
			"TTV AB가 {date} 이후 광고 {count}개를 차단했습니다. 이 확장 프로그램은 무료이며 개발자 한 명이 만들고 있습니다. 광고를 잘 막아 주고 있다면 커피 한 잔으로 개발을 응원해 주세요.",
		donationButton: "☕ 개발자 후원하기",
		achievementUnlocked: "업적 달성!",
	},
	zh_CN: {
		unhooked:
			"刷新此标签页即可在当前播放器中开始拦截广告。聊天会重新连接，画中画会关闭。",
		postAd:
			"广告结束后播放未能恢复。请刷新此标签页以重新开始直播。聊天会重新连接，画中画会关闭。",
		crash:
			"TTV AB 无法重启 Twitch 的播放器进程。如果播放仍然卡住，请刷新此标签页。聊天会重新连接，画中画会关闭。",
		refresh: "刷新标签页",
		dismiss: "关闭",
		welcomePill: "已启用",
		adBreak: "广告时段",
		welcomeTitle: "一切就绪",
		welcomeBody: "Twitch 直播和回放中的广告现在会被自动拦截，无需任何设置。",
		pinTitle: "固定以便快速访问",
		pinBody: "点击工具栏中的 🧩 菜单，找到 TTV AB，然后点击图钉。",
		donationPill: "💜 免费",
		donationTitle: "喜欢没有广告的 Twitch 吗？",
		donationBody:
			"自{date}以来，TTV AB 已为你拦截了 {count} 个广告。它完全免费，由一个人独立开发。如果它帮你挡住了广告，不妨请开发者喝杯咖啡支持一下。",
		donationButton: "☕ 支持开发者",
		achievementUnlocked: "成就已解锁！",
	},
	zh_TW: {
		unhooked:
			"重新整理此分頁即可在目前的播放器中開始封鎖廣告。聊天室會重新連線，子母畫面會關閉。",
		postAd:
			"廣告結束後播放未能恢復。請重新整理此分頁以重新開始實況。聊天室會重新連線，子母畫面會關閉。",
		crash:
			"TTV AB 無法重新啟動 Twitch 的播放器程序。如果播放仍然卡住，請重新整理此分頁。聊天室會重新連線，子母畫面會關閉。",
		refresh: "重新整理分頁",
		dismiss: "關閉",
		welcomePill: "已啟用",
		adBreak: "廣告時段",
		welcomeTitle: "一切就緒",
		welcomeBody: "Twitch 實況與重播的廣告現在會自動攔截，不需要任何設定。",
		pinTitle: "釘選以便快速存取",
		pinBody: "點擊工具列中的 🧩 選單，找到 TTV AB，然後點擊圖釘。",
		donationPill: "💜 免費",
		donationTitle: "喜歡沒有廣告的 Twitch 嗎？",
		donationBody:
			"自{date}以來，TTV AB 已為你攔截 {count} 則廣告。它完全免費，由一個人獨立開發。如果它幫你擋住了廣告，不妨請開發者喝杯咖啡支持一下。",
		donationButton: "☕ 支持開發者",
		achievementUnlocked: "成就已解鎖！",
	},
	ru: {
		unhooked:
			"Обновите эту вкладку, чтобы начать блокировку рекламы в текущем плеере. Чат переподключится, а режим «картинка в картинке» закроется.",
		postAd:
			"Воспроизведение не восстановилось после рекламы. Обновите эту вкладку, чтобы перезапустить трансляцию. Чат переподключится, а режим «картинка в картинке» закроется.",
		crash:
			"TTV AB не удалось перезапустить процесс плеера Twitch. Если воспроизведение всё ещё зависло, обновите эту вкладку. Чат переподключится, а режим «картинка в картинке» закроется.",
		refresh: "Обновить вкладку",
		dismiss: "Закрыть",
		welcomePill: "Включено",
		adBreak: "Рекламная пауза",
		welcomeTitle: "Всё готово",
		welcomeBody:
			"Реклама в трансляциях и записях Twitch теперь блокируется автоматически, ничего настраивать не нужно.",
		pinTitle: "Закрепите для быстрого доступа",
		pinBody:
			"Нажмите на значок 🧩 на панели инструментов, найдите TTV AB и нажмите на значок булавки.",
		donationPill: "💜 Бесплатно",
		donationTitle: "Нравится Twitch без рекламы?",
		donationBody:
			"С {date} заблокировано рекламных объявлений: {count}. Расширение бесплатное и создано одним человеком. Если оно избавляет вас от рекламы, угостите разработчика чашкой кофе.",
		donationButton: "☕ Поддержать разработчика",
		achievementUnlocked: "Достижение получено!",
	},
	uk: {
		unhooked:
			"Оновіть цю вкладку, щоб почати блокування реклами в поточному програвачі. Чат перепідключиться, а режим «картинка в картинці» закриється.",
		postAd:
			"Відтворення не відновилося після реклами. Оновіть цю вкладку, щоб перезапустити трансляцію. Чат перепідключиться, а режим «картинка в картинці» закриється.",
		crash:
			"TTV AB не вдалося перезапустити процес програвача Twitch. Якщо відтворення досі зависло, оновіть цю вкладку. Чат перепідключиться, а режим «картинка в картинці» закриється.",
		refresh: "Оновити вкладку",
		dismiss: "Закрити",
		welcomePill: "Увімкнено",
		adBreak: "Рекламна пауза",
		welcomeTitle: "Усе готово",
		welcomeBody:
			"Реклама в трансляціях і записах Twitch тепер блокується автоматично, нічого налаштовувати не потрібно.",
		pinTitle: "Закріпіть для швидкого доступу",
		pinBody:
			"Натисніть на значок 🧩 на панелі інструментів, знайдіть TTV AB і натисніть на значок закріплення.",
		donationPill: "💜 Безкоштовно",
		donationTitle: "Подобається Twitch без реклами?",
		donationBody:
			"З {date} заблоковано рекламних оголошень: {count}. Розширення безкоштовне і створене однією людиною. Якщо воно позбавляє вас реклами, пригостіть розробника чашкою кави.",
		donationButton: "☕ Підтримати розробника",
		achievementUnlocked: "Досягнення отримано!",
	},
};

const _PAGE_ACHIEVEMENT_TEXT = {
	en: {
		first_block: { name: "Ad Slayer", desc: "Blocked your first ad!" },
		block_10: { name: "Blocker", desc: "Blocked 10 ads!" },
		block_100: { name: "Guardian", desc: "Blocked 100 ads!" },
		block_500: { name: "Sentinel", desc: "Blocked 500 ads!" },
		block_1000: { name: "Legend", desc: "Blocked 1000 ads!" },
		block_5000: { name: "Mythic", desc: "Blocked 5000 ads!" },
		time_1h: { name: "Hour Saver", desc: "Saved 1 hour from ads!" },
		time_10h: { name: "Time Master", desc: "Saved 10 hours from ads!" },
		channels_5: { name: "Explorer", desc: "Blocked ads on 5 channels!" },
		channels_20: { name: "Adventurer", desc: "Blocked ads on 20 channels!" },
		block_10000: { name: "Diamond", desc: "Blocked 10,000 ads!" },
		channels_50: { name: "Globetrotter", desc: "Blocked ads on 50 channels!" },
	},
	es: {
		first_block: {
			name: "Cazador de anuncios",
			desc: "¡Has bloqueado tu primer anuncio!",
		},
		block_10: { name: "Bloqueador", desc: "¡Has bloqueado 10 anuncios!" },
		block_100: { name: "Guardián", desc: "¡Has bloqueado 100 anuncios!" },
		block_500: { name: "Centinela", desc: "¡Has bloqueado 500 anuncios!" },
		block_1000: { name: "Leyenda", desc: "¡Has bloqueado 1000 anuncios!" },
		block_5000: { name: "Mítico", desc: "¡Has bloqueado 5000 anuncios!" },
		time_1h: {
			name: "Ahorrador de tiempo",
			desc: "¡Has evitado 1 hora de anuncios!",
		},
		time_10h: {
			name: "Maestro del tiempo",
			desc: "¡Has evitado 10 horas de anuncios!",
		},
		channels_5: {
			name: "Explorador",
			desc: "¡Has bloqueado anuncios en 5 canales!",
		},
		channels_20: {
			name: "Aventurero",
			desc: "¡Has bloqueado anuncios en 20 canales!",
		},
		block_10000: { name: "Diamante", desc: "¡Has bloqueado 10.000 anuncios!" },
		channels_50: {
			name: "Trotamundos",
			desc: "¡Has bloqueado anuncios en 50 canales!",
		},
	},
	fr: {
		first_block: {
			name: "Chasseur de pubs",
			desc: "Vous avez bloqué votre première pub !",
		},
		block_10: { name: "Bloqueur", desc: "Vous avez bloqué 10 pubs !" },
		block_100: { name: "Gardien", desc: "Vous avez bloqué 100 pubs !" },
		block_500: { name: "Sentinelle", desc: "Vous avez bloqué 500 pubs !" },
		block_1000: { name: "Légende", desc: "Vous avez bloqué 1000 pubs !" },
		block_5000: { name: "Mythique", desc: "Vous avez bloqué 5000 pubs !" },
		time_1h: { name: "Gagne-temps", desc: "Vous avez évité 1 heure de pubs !" },
		time_10h: {
			name: "Maître du temps",
			desc: "Vous avez évité 10 heures de pubs !",
		},
		channels_5: {
			name: "Explorateur",
			desc: "Vous avez bloqué des pubs sur 5 chaînes !",
		},
		channels_20: {
			name: "Aventurier",
			desc: "Vous avez bloqué des pubs sur 20 chaînes !",
		},
		block_10000: { name: "Diamant", desc: "Vous avez bloqué 10 000 pubs !" },
		channels_50: {
			name: "Globe-trotteur",
			desc: "Vous avez bloqué des pubs sur 50 chaînes !",
		},
	},
	de: {
		first_block: {
			name: "Werbejäger",
			desc: "Du hast deine erste Anzeige blockiert!",
		},
		block_10: { name: "Blocker", desc: "Du hast 10 Werbeanzeigen blockiert!" },
		block_100: {
			name: "Wächter",
			desc: "Du hast 100 Werbeanzeigen blockiert!",
		},
		block_500: {
			name: "Wachposten",
			desc: "Du hast 500 Werbeanzeigen blockiert!",
		},
		block_1000: {
			name: "Legende",
			desc: "Du hast 1000 Werbeanzeigen blockiert!",
		},
		block_5000: {
			name: "Mythisch",
			desc: "Du hast 5000 Werbeanzeigen blockiert!",
		},
		time_1h: {
			name: "Zeitsparer",
			desc: "Du hast 1 Stunde Werbezeit gespart!",
		},
		time_10h: {
			name: "Zeitmeister",
			desc: "Du hast 10 Stunden Werbezeit gespart!",
		},
		channels_5: {
			name: "Entdecker",
			desc: "Du hast auf 5 Kanälen Werbung blockiert!",
		},
		channels_20: {
			name: "Abenteurer",
			desc: "Du hast auf 20 Kanälen Werbung blockiert!",
		},
		block_10000: {
			name: "Diamant",
			desc: "Du hast 10.000 Werbeanzeigen blockiert!",
		},
		channels_50: {
			name: "Weltenbummler",
			desc: "Du hast auf 50 Kanälen Werbung blockiert!",
		},
	},
	pt: {
		first_block: {
			name: "Caçador de anúncios",
			desc: "Você bloqueou seu primeiro anúncio!",
		},
		block_10: { name: "Bloqueador", desc: "Você bloqueou 10 anúncios!" },
		block_100: { name: "Guardião", desc: "Você bloqueou 100 anúncios!" },
		block_500: { name: "Sentinela", desc: "Você bloqueou 500 anúncios!" },
		block_1000: { name: "Lenda", desc: "Você bloqueou 1000 anúncios!" },
		block_5000: { name: "Mítico", desc: "Você bloqueou 5000 anúncios!" },
		time_1h: {
			name: "Poupador de tempo",
			desc: "Você evitou 1 hora de anúncios!",
		},
		time_10h: {
			name: "Mestre do tempo",
			desc: "Você evitou 10 horas de anúncios!",
		},
		channels_5: {
			name: "Explorador",
			desc: "Você bloqueou anúncios em 5 canais!",
		},
		channels_20: {
			name: "Aventureiro",
			desc: "Você bloqueou anúncios em 20 canais!",
		},
		block_10000: { name: "Diamante", desc: "Você bloqueou 10.000 anúncios!" },
		channels_50: {
			name: "Viajante mundial",
			desc: "Você bloqueou anúncios em 50 canais!",
		},
	},
	it: {
		first_block: {
			name: "Cacciatore di annunci",
			desc: "Hai bloccato il tuo primo annuncio!",
		},
		block_10: { name: "Bloccatore", desc: "Hai bloccato 10 annunci!" },
		block_100: { name: "Guardiano", desc: "Hai bloccato 100 annunci!" },
		block_500: { name: "Sentinella", desc: "Hai bloccato 500 annunci!" },
		block_1000: { name: "Leggenda", desc: "Hai bloccato 1000 annunci!" },
		block_5000: { name: "Mitico", desc: "Hai bloccato 5000 annunci!" },
		time_1h: { name: "Salvatempo", desc: "Hai evitato 1 ora di annunci!" },
		time_10h: {
			name: "Maestro del tempo",
			desc: "Hai evitato 10 ore di annunci!",
		},
		channels_5: {
			name: "Esploratore",
			desc: "Hai bloccato annunci su 5 canali!",
		},
		channels_20: {
			name: "Avventuriero",
			desc: "Hai bloccato annunci su 20 canali!",
		},
		block_10000: { name: "Diamante", desc: "Hai bloccato 10.000 annunci!" },
		channels_50: {
			name: "Giramondo",
			desc: "Hai bloccato annunci su 50 canali!",
		},
	},
	ja: {
		first_block: {
			name: "広告ハンター",
			desc: "最初の広告をブロックしました！",
		},
		block_10: { name: "ブロッカー", desc: "広告を10件ブロックしました！" },
		block_100: { name: "ガーディアン", desc: "広告を100件ブロックしました！" },
		block_500: { name: "センチネル", desc: "広告を500件ブロックしました！" },
		block_1000: { name: "レジェンド", desc: "広告を1000件ブロックしました！" },
		block_5000: { name: "ミシック", desc: "広告を5000件ブロックしました！" },
		time_1h: { name: "タイムセーバー", desc: "広告時間を1時間節約しました！" },
		time_10h: {
			name: "タイムマスター",
			desc: "広告時間を10時間節約しました！",
		},
		channels_5: {
			name: "エクスプローラー",
			desc: "5チャンネルで広告をブロックしました！",
		},
		channels_20: {
			name: "冒険者",
			desc: "20チャンネルで広告をブロックしました！",
		},
		block_10000: {
			name: "ダイヤモンド",
			desc: "広告を10,000件ブロックしました！",
		},
		channels_50: {
			name: "世界旅行者",
			desc: "50チャンネルで広告をブロックしました！",
		},
	},
	ko: {
		first_block: { name: "광고 사냥꾼", desc: "첫 광고를 차단했습니다!" },
		block_10: { name: "블로커", desc: "광고 10개를 차단했습니다!" },
		block_100: { name: "수호자", desc: "광고 100개를 차단했습니다!" },
		block_500: { name: "파수꾼", desc: "광고 500개를 차단했습니다!" },
		block_1000: { name: "전설", desc: "광고 1000개를 차단했습니다!" },
		block_5000: { name: "신화", desc: "광고 5000개를 차단했습니다!" },
		time_1h: { name: "시간 절약가", desc: "광고 시간 1시간을 절약했습니다!" },
		time_10h: { name: "시간의 달인", desc: "광고 시간 10시간을 절약했습니다!" },
		channels_5: { name: "탐험가", desc: "5개 채널에서 광고를 차단했습니다!" },
		channels_20: { name: "모험가", desc: "20개 채널에서 광고를 차단했습니다!" },
		block_10000: { name: "다이아몬드", desc: "광고 10,000개를 차단했습니다!" },
		channels_50: {
			name: "세계여행자",
			desc: "50개 채널에서 광고를 차단했습니다!",
		},
	},
	zh_CN: {
		first_block: { name: "广告猎手", desc: "你已成功拦截第一条广告！" },
		block_10: { name: "拦截者", desc: "你已拦截 10 条广告！" },
		block_100: { name: "守护者", desc: "你已拦截 100 条广告！" },
		block_500: { name: "哨兵", desc: "你已拦截 500 条广告！" },
		block_1000: { name: "传奇", desc: "你已拦截 1000 条广告！" },
		block_5000: { name: "神话", desc: "你已拦截 5000 条广告！" },
		time_1h: { name: "省时达人", desc: "你已节省 1 小时广告时间！" },
		time_10h: { name: "时间大师", desc: "你已节省 10 小时广告时间！" },
		channels_5: { name: "探索者", desc: "你已在 5 个频道中拦截广告！" },
		channels_20: { name: "冒险家", desc: "你已在 20 个频道中拦截广告！" },
		block_10000: { name: "钻石", desc: "你已拦截 10,000 条广告！" },
		channels_50: { name: "环球旅行家", desc: "你已在 50 个频道中拦截广告！" },
	},
	zh_TW: {
		first_block: { name: "廣告獵手", desc: "你已成功攔截第一則廣告！" },
		block_10: { name: "攔截者", desc: "你已攔截 10 則廣告！" },
		block_100: { name: "守護者", desc: "你已攔截 100 則廣告！" },
		block_500: { name: "哨兵", desc: "你已攔截 500 則廣告！" },
		block_1000: { name: "傳奇", desc: "你已攔截 1000 則廣告！" },
		block_5000: { name: "神話", desc: "你已攔截 5000 則廣告！" },
		time_1h: { name: "省時達人", desc: "你已節省 1 小時廣告時間！" },
		time_10h: { name: "時間大師", desc: "你已節省 10 小時廣告時間！" },
		channels_5: { name: "探索者", desc: "你已在 5 個頻道中攔截廣告！" },
		channels_20: { name: "冒險家", desc: "你已在 20 個頻道中攔截廣告！" },
		block_10000: { name: "鑽石", desc: "你已攔截 10,000 則廣告！" },
		channels_50: { name: "環球旅行家", desc: "你已在 50 個頻道中攔截廣告！" },
	},
	ru: {
		first_block: {
			name: "Охотник на рекламу",
			desc: "Вы заблокировали свою первую рекламу!",
		},
		block_10: { name: "Блокировщик", desc: "Вы заблокировали 10 объявлений!" },
		block_100: { name: "Хранитель", desc: "Вы заблокировали 100 объявлений!" },
		block_500: { name: "Страж", desc: "Вы заблокировали 500 объявлений!" },
		block_1000: { name: "Легенда", desc: "Вы заблокировали 1000 объявлений!" },
		block_5000: {
			name: "Мифический",
			desc: "Вы заблокировали 5000 объявлений!",
		},
		time_1h: { name: "Бережливый", desc: "Вы сэкономили 1 час на рекламе!" },
		time_10h: {
			name: "Мастер времени",
			desc: "Вы сэкономили 10 часов на рекламе!",
		},
		channels_5: {
			name: "Исследователь",
			desc: "Вы заблокировали рекламу на 5 каналах!",
		},
		channels_20: {
			name: "Авантюрист",
			desc: "Вы заблокировали рекламу на 20 каналах!",
		},
		block_10000: {
			name: "Бриллиант",
			desc: "Вы заблокировали 10 000 объявлений!",
		},
		channels_50: {
			name: "Покоритель мира",
			desc: "Вы заблокировали рекламу на 50 каналах!",
		},
	},
	uk: {
		first_block: {
			name: "Мисливець на рекламу",
			desc: "Ви заблокували свою першу рекламу!",
		},
		block_10: { name: "Блокувальник", desc: "Ви заблокували 10 оголошень!" },
		block_100: { name: "Хранитель", desc: "Ви заблокували 100 оголошень!" },
		block_500: { name: "Страж", desc: "Ви заблокували 500 оголошень!" },
		block_1000: { name: "Легенда", desc: "Ви заблокували 1000 оголошень!" },
		block_5000: { name: "Міфічний", desc: "Ви заблокували 5000 оголошень!" },
		time_1h: { name: "Ощадливий", desc: "Ви заощадили 1 годину на рекламі!" },
		time_10h: {
			name: "Майстер часу",
			desc: "Ви заощадили 10 годин на рекламі!",
		},
		channels_5: {
			name: "Дослідник",
			desc: "Ви заблокували рекламу на 5 каналах!",
		},
		channels_20: {
			name: "Авантюрист",
			desc: "Ви заблокували рекламу на 20 каналах!",
		},
		block_10000: { name: "Діамант", desc: "Ви заблокували 10 000 оголошень!" },
		channels_50: {
			name: "Підкорювач світу",
			desc: "Ви заблокували рекламу на 50 каналах!",
		},
	},
};

let _pageStatsPaused = false;
let _pageLanguageChoice = "auto";
let _pageUiLanguage = "";

function _matchLanguageCode(language, supported) {
	const candidate = String(language || "").trim();
	if (!candidate || candidate.toLowerCase() === "auto") return null;
	const normalizedCandidate = candidate.replace(/-/g, "_");
	if (Object.hasOwn(supported, normalizedCandidate)) {
		return normalizedCandidate;
	}
	const lowerCandidate = candidate.toLowerCase();
	if (lowerCandidate.startsWith("zh")) {
		const normalized =
			!/hans/.test(lowerCandidate) && /hant|tw|hk|mo/.test(lowerCandidate)
				? "zh_TW"
				: "zh_CN";
		return Object.hasOwn(supported, normalized) ? normalized : null;
	}
	const base = lowerCandidate.split(/[-_]/)[0];
	return Object.hasOwn(supported, base) ? base : null;
}

function _setPageStatsPaused(paused) {
	_pageStatsPaused = paused === true;
}

function _isPageStatsPaused() {
	return _pageStatsPaused;
}

function _setPageLanguagePreference(choice, uiLanguage) {
	_pageLanguageChoice = typeof choice === "string" ? choice : "auto";
	_pageUiLanguage = typeof uiLanguage === "string" ? uiLanguage : "";
}

function _getPageLanguage() {
	for (const candidate of [
		_pageLanguageChoice,
		_pageUiLanguage,
		...(Array.isArray(navigator?.languages) ? navigator.languages : []),
		navigator?.language,
	]) {
		const language = _matchLanguageCode(candidate, _PAGE_TEXT);
		if (language) {
			let localeTag = language.replace(/_/g, "-");
			try {
				localeTag =
					Intl.getCanonicalLocales(String(candidate).replace(/_/g, "-"))[0] ||
					localeTag;
			} catch {}
			return { language, localeTag };
		}
	}
	return { language: "en", localeTag: "en" };
}

function _getPageText() {
	return _PAGE_TEXT[_getPageLanguage().language] || _PAGE_TEXT.en;
}

function _formatPageText(template, values) {
	return String(template || "").replace(
		/\{(\w+)\}/g,
		(_match, key) => values[key] ?? "",
	);
}

let _workerRecoveryNoticeMediaKey: string | null = null;
let _workerRecoveryNoticeDismissTimer: ReturnType<typeof setTimeout> | null =
	null;
let _workerRecoveryNoticeDisplayListener: (() => void) | null = null;

function _getWorkerRecoveryNoticeHost() {
	const fullscreen = document.fullscreenElement;
	if (!fullscreen) return document.body;
	return fullscreen instanceof HTMLElement &&
		!(fullscreen instanceof HTMLMediaElement) &&
		!(fullscreen instanceof HTMLIFrameElement)
		? fullscreen
		: null;
}

function _clearWorkerRecoveryNotice(mediaKey = null, reason = null) {
	if (
		reason &&
		document.getElementById("ttvab-worker-recovery")?.dataset.reason !== reason
	)
		return;
	if (
		!_workerRecoveryNoticeMediaKey ||
		(mediaKey && _workerRecoveryNoticeMediaKey !== mediaKey)
	)
		return;
	if (_workerRecoveryNoticeDismissTimer !== null) {
		clearTimeout(_workerRecoveryNoticeDismissTimer);
		_workerRecoveryNoticeDismissTimer = null;
	}
	if (_workerRecoveryNoticeDisplayListener) {
		document.removeEventListener(
			"visibilitychange",
			_workerRecoveryNoticeDisplayListener,
		);
		document.removeEventListener(
			"fullscreenchange",
			_workerRecoveryNoticeDisplayListener,
		);
		_workerRecoveryNoticeDisplayListener = null;
	}
	const notice = document.getElementById("ttvab-worker-recovery");
	if (!mediaKey || notice?.dataset.mediaKey === mediaKey) notice?.remove();
	_workerRecoveryNoticeMediaKey = null;
}

function _showWorkerRecoveryNotice(mediaKey, reason = "crash") {
	const currentContext = _getPlaybackContextFromUrl(window.location.href);
	const isUnhooked = reason === "unhooked";
	const isPostAd = reason === "post-ad";
	const recoveryState = isUnhooked
		? _UnhookedPlayerState
		: isPostAd
			? _PostAdRecoveryNoticeState
			: _getWorkerRecoveryState(currentContext, false);
	if (
		!document.body ||
		!mediaKey ||
		currentContext.MediaKey !== mediaKey ||
		(isUnhooked
			? !_canRefreshUnhookedPlayer(mediaKey)
			: isPostAd
				? !_canRefreshPostAdPlayer(mediaKey)
				: recoveryState?.phase !== "exhausted") ||
		Number(recoveryState.noticeShownAt) > 0
	)
		return;
	const noticeShownAt = Date.now();
	const pageGeneration =
		Number(__TTVAB_STATE__.PagePlaybackContextGeneration) || 0;
	const canRefresh = () => {
		const context = _getPlaybackContextFromUrl(window.location.href);
		const currentRecovery = isUnhooked
			? _UnhookedPlayerState
			: isPostAd
				? _PostAdRecoveryNoticeState
				: _getWorkerRecoveryState(context, false);
		return Boolean(
			mediaKey &&
				context.MediaKey === mediaKey &&
				(Number(__TTVAB_STATE__.PagePlaybackContextGeneration) || 0) ===
					pageGeneration &&
				(isUnhooked
					? _canRefreshUnhookedPlayer(mediaKey)
					: isPostAd
						? _canRefreshPostAdPlayer(mediaKey)
						: currentRecovery?.phase === "exhausted") &&
				currentRecovery.noticeShownAt === noticeShownAt,
		);
	};
	const existing = document.getElementById("ttvab-worker-recovery");
	if (existing?.dataset.mediaKey === mediaKey) return;
	_clearWorkerRecoveryNotice();
	const notice = document.createElement("div");
	notice.id = "ttvab-worker-recovery";
	notice.dataset.mediaKey = mediaKey;
	notice.dataset.reason = reason;
	notice.setAttribute("role", "status");
	notice.style.cssText =
		"position:fixed;bottom:20px;right:20px;z-index:2147483647;max-width:360px;padding:16px;border:1px solid #9146ff;border-radius:8px;background:#18181b;color:#efeff1;font:14px/1.5 sans-serif;box-shadow:0 4px 16px #0008";
	const text = _getPageText();
	notice.lang = _getPageLanguage().localeTag;
	const message = document.createElement("p");
	message.textContent = isUnhooked
		? text.unhooked
		: isPostAd
			? text.postAd
			: text.crash;
	message.style.margin = "0 0 12px";
	const refresh = document.createElement("button");
	refresh.type = "button";
	refresh.textContent = text.refresh;
	refresh.style.cssText =
		"padding:6px 12px;border:0;border-radius:4px;background:#9146ff;color:white;cursor:pointer;font:inherit";
	refresh.onclick = () => {
		if (!canRefresh()) {
			_clearWorkerRecoveryNotice(mediaKey);
			return;
		}
		window.location.reload();
	};
	const dismiss = document.createElement("button");
	dismiss.type = "button";
	dismiss.textContent = text.dismiss;
	dismiss.style.cssText =
		"margin-left:8px;padding:6px 12px;border:0;border-radius:4px;background:#303036;color:#efeff1;cursor:pointer;font:inherit";
	dismiss.onclick = () => _clearWorkerRecoveryNotice(mediaKey);
	notice.append(message, refresh, dismiss);
	(_getWorkerRecoveryNoticeHost() || document.body).appendChild(notice);
	_workerRecoveryNoticeMediaKey = mediaKey;
	recoveryState.noticeShownAt = noticeShownAt;
	const startDismissTimer = () => {
		const timerID = setTimeout(() => {
			if (_workerRecoveryNoticeDismissTimer !== timerID) return;
			_clearWorkerRecoveryNotice(mediaKey);
		}, 3000);
		_workerRecoveryNoticeDismissTimer = timerID;
	};
	const isHidden = () =>
		typeof _isNativeDocumentHidden === "function"
			? _isNativeDocumentHidden()
			: document.visibilityState === "hidden";
	const onDisplayChange = () => {
		if (_workerRecoveryNoticeDisplayListener !== onDisplayChange) return;
		const host = _getWorkerRecoveryNoticeHost();
		if (host && notice.parentElement !== host) host.appendChild(notice);
		if (
			isUnhooked ||
			!host ||
			isHidden() ||
			_workerRecoveryNoticeDismissTimer !== null
		)
			return;
		startDismissTimer();
	};
	_workerRecoveryNoticeDisplayListener = onDisplayChange;
	document.addEventListener("visibilitychange", onDisplayChange);
	document.addEventListener("fullscreenchange", onDisplayChange);
	onDisplayChange();
}

function _showDonation() {
	try {
		if (window.top !== window) return;
		const uiFlags = _getUiFlags();
		if (uiFlags.donationScheduled) return;
		const now = Date.now();
		const state = _readReminderState(now);
		if (state.nextAt > now + _REMINDER_SUPPORTER_INTERVAL) {
			state.nextAt = now + _REMINDER_BASE_INTERVAL;
		}
		_writeReminderState(state);
		if (now < state.nextAt && state.baseline !== null) return;
		uiFlags.donationScheduled = true;
		if (uiFlags.donationDelayTimer) clearTimeout(uiFlags.donationDelayTimer);
		uiFlags.donationDelayTimer = setTimeout(
			() => _attemptDonationReminder(uiFlags, 1),
			_REMINDER_SHOW_DELAY_MS,
		);
	} catch (e) {
		_log(`Donation reminder error: ${e.message}`, "error");
	}
}

function _attemptDonationReminder(uiFlags: UiFlags, attempt: number) {
	uiFlags.donationDelayTimer = null;
	try {
		if (_pageStatsPaused) {
			uiFlags.donationScheduled = false;
			return;
		}
		const now = Date.now();
		const state = _readReminderState(now);
		const count =
			__TTVAB_STATE__?.HasResolvedAdsCountState === true
				? Number(_S?.adsBlocked)
				: Number.NaN;
		if (
			Number.isFinite(count) &&
			(state.baseline === null || count < state.baseline)
		) {
			state.baseline = Math.max(0, Math.trunc(count));
			state.since = now;
			_writeReminderState(state);
		}
		const blockedSince =
			Number.isFinite(count) && state.baseline !== null
				? count - state.baseline
				: 0;
		if (
			(Number.isFinite(count) && now < state.nextAt) ||
			(Number.isFinite(count) && blockedSince < _REMINDER_MIN_ADS_BLOCKED) ||
			document.getElementById("ttvab-reminder")
		) {
			uiFlags.donationScheduled = false;
			return;
		}
		if (!Number.isFinite(count) || !_isReminderMomentQuiet()) {
			if (attempt >= _REMINDER_MAX_ATTEMPTS) {
				uiFlags.donationScheduled = false;
				return;
			}
			uiFlags.donationDelayTimer = setTimeout(
				() => _attemptDonationReminder(uiFlags, attempt + 1),
				_REMINDER_RETRY_DELAY_MS,
			);
			return;
		}
		uiFlags.donationScheduled = false;
		const since = state.since;

		const toast = document.createElement("div");
		toast.id = "ttvab-reminder";
		toast.innerHTML = `
                <style>
                    #ttvab-reminder{position:fixed;bottom:20px;right:20px;z-index:999999;width:320px;max-width:calc(100vw - 40px);padding:16px 18px 18px;border-radius:14px;border:1px solid transparent;background:linear-gradient(165deg,#170734 0%,#0d0220 55%,#130534 100%) padding-box,linear-gradient(120deg,#ff3db4 0%,#9146FF 45%,#2ff0e6 100%) border-box;color:#f1e9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 14px 44px rgba(13,2,32,.65),0 0 26px rgba(145,70,255,.28);overflow:hidden;animation:ttvab-reminder-in .45s cubic-bezier(.21,1.02,.55,1)}
                    @keyframes ttvab-reminder-in{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
                    @keyframes ttvab-reminder-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(12px) scale(.97)}}
                    #ttvab-reminder .brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-right:24px}
                    #ttvab-reminder .mark{width:22px;height:22px;border-radius:6px;object-fit:cover;display:block;box-shadow:0 0 12px rgba(145,70,255,.55)}
                    #ttvab-reminder .name{font-size:12px;font-weight:800;letter-spacing:.14em;background:linear-gradient(90deg,#ff3db4,#2ff0e6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
                    #ttvab-reminder .pill{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ff3db4;border:1px solid rgba(255,61,180,.45);border-radius:999px;padding:2px 8px;background:rgba(255,61,180,.08)}
                    #ttvab-reminder-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#b7a6e6;font-size:18px;cursor:pointer;padding:2px;line-height:1;transition:color .15s ease}
                    #ttvab-reminder-close:hover{color:#fff}
                    #ttvab-reminder .title{margin:0 0 4px;font-size:16px;font-weight:700;color:#fff}
                    #ttvab-reminder .sub{margin:0 0 14px;color:#b7a6e6;font-size:13px}
                    #ttvab-reminder-btn{display:block;width:100%;text-align:center;padding:10px 16px;background:linear-gradient(120deg,#ff3db4 0%,#9146FF 60%,#772CE8 100%);color:#fff;border:none;border-radius:9px;font-weight:700;cursor:pointer;font-size:13px;letter-spacing:.02em;box-shadow:0 4px 16px rgba(145,70,255,.4);transition:transform .15s ease,box-shadow .15s ease}
                    #ttvab-reminder-btn:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(255,61,180,.45)}
                    #ttvab-reminder .progress{position:absolute;left:0;right:0;bottom:0;height:2px;transform-origin:left;background:linear-gradient(90deg,#ff3db4,#9146FF,#2ff0e6);animation:ttvab-reminder-bar 15s linear forwards}
                    @keyframes ttvab-reminder-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
                    @media (prefers-reduced-motion:reduce){#ttvab-reminder{animation:none}#ttvab-reminder .progress{animation:none;transform:scaleX(1)}#ttvab-reminder-btn{transition:none}}
                </style>
                <button id="ttvab-reminder-close">×</button>
                <div class="brand">
                    <img class="mark" alt="" />
                    <div class="name">TTV&nbsp;AB</div>
                    <div class="pill"></div>
                </div>
                <div class="title"></div>
                <p class="sub"></p>
                <button id="ttvab-reminder-btn"></button>
                <div class="progress"></div>
            `;

		const markImage = toast.querySelector("img.mark");
		if (markImage instanceof HTMLImageElement) {
			markImage.src = _UI_ICON_SRC;
		}
		const { localeTag } = _getPageLanguage();
		const text = _getPageText();
		toast.lang = localeTag;
		_setToastText(toast, ".pill", text.donationPill);
		_setToastText(toast, ".title", text.donationTitle);
		_setToastText(
			toast,
			".sub",
			_formatPageText(text.donationBody, {
				count: blockedSince.toLocaleString(localeTag),
				date: new Date(since).toLocaleDateString(localeTag, {
					month: "long",
					day: "numeric",
				}),
			}),
		);
		_setToastText(toast, "#ttvab-reminder-btn", text.donationButton);
		toast
			.querySelector("#ttvab-reminder-close")
			?.setAttribute("aria-label", text.dismiss);

		document.body.appendChild(toast);
		state.shownCount += 1;
		state.nextAt = now + _getReminderIntervalMs(state);
		state.baseline = Math.max(0, Math.trunc(count));
		state.since = now;
		_writeReminderState(state);

		const reminderClose = toast.querySelector("#ttvab-reminder-close");
		if (reminderClose instanceof HTMLElement) {
			reminderClose.onclick = () => toast.remove();
		}
		const reminderButton = toast.querySelector("#ttvab-reminder-btn");
		if (reminderButton instanceof HTMLElement) {
			reminderButton.onclick = () => {
				const supportedState = _readReminderState(Date.now());
				supportedState.supported = true;
				supportedState.nextAt = Date.now() + _REMINDER_SUPPORTER_INTERVAL;
				_writeReminderState(supportedState);
				window.open(
					"https://ko-fi.com/gosudrm",
					"_blank",
					"noopener,noreferrer",
				);
				if (toast.isConnected) {
					toast.remove();
				}
			};
		}

		if (uiFlags.donationDismissTimer)
			clearTimeout(uiFlags.donationDismissTimer);
		uiFlags.donationDismissTimer = setTimeout(() => {
			uiFlags.donationDismissTimer = null;
			if (toast.isConnected) {
				toast.style.animation = "ttvab-reminder-out .3s ease forwards";
				setTimeout(() => toast.remove(), 300);
			}
		}, 15000);
	} catch (e) {
		uiFlags.donationScheduled = false;
		_log(`Donation reminder error: ${e.message}`, "error");
	}
}

function _setToastText(toast, selector, value) {
	const element = toast.querySelector(selector);
	if (element) element.textContent = String(value ?? "");
}

function _showWelcome() {
	try {
		if (window.top !== window) return;
		const uiFlags = _getUiFlags();
		if (uiFlags.welcomeScheduled || _getUiStorageItem(_FIRST_RUN_KEY)) return;

		uiFlags.welcomeScheduled = true;
		if (uiFlags.welcomeDelayTimer) clearTimeout(uiFlags.welcomeDelayTimer);
		uiFlags.welcomeDelayTimer = setTimeout(() => {
			uiFlags.welcomeDelayTimer = null;
			uiFlags.welcomeScheduled = false;
			if (
				_getUiStorageItem(_FIRST_RUN_KEY) ||
				document.getElementById("ttvab-welcome") ||
				!document.body
			)
				return;
			if (
				typeof _isNativeDocumentHidden === "function"
					? _isNativeDocumentHidden()
					: document.visibilityState === "hidden"
			) {
				document.addEventListener("visibilitychange", _showWelcome, {
					once: true,
				});
				return;
			}
			const toast = document.createElement("div");
			toast.id = "ttvab-welcome";
			toast.innerHTML = `
                <style>
                    #ttvab-welcome{position:fixed;top:20px;right:20px;z-index:999999;width:340px;max-width:calc(100vw - 40px);padding:16px 18px 18px;border-radius:14px;border:1px solid transparent;background:linear-gradient(165deg,#170734 0%,#0d0220 55%,#130534 100%) padding-box,linear-gradient(120deg,#ff3db4 0%,#9146FF 45%,#2ff0e6 100%) border-box;color:#f1e9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.5;box-shadow:0 14px 44px rgba(13,2,32,.65),0 0 26px rgba(145,70,255,.28);overflow:hidden;animation:ttvab-welcome-in .45s cubic-bezier(.21,1.02,.55,1)}
                    @keyframes ttvab-welcome-in{from{opacity:0;transform:translateY(-14px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
                    @keyframes ttvab-welcome-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-10px) scale(.97)}}
                    #ttvab-welcome .brand{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-right:24px}
                    #ttvab-welcome .mark{width:22px;height:22px;border-radius:6px;object-fit:cover;display:block;box-shadow:0 0 12px rgba(145,70,255,.55)}
                    #ttvab-welcome .name{font-size:12px;font-weight:800;letter-spacing:.14em;background:linear-gradient(90deg,#ff3db4,#2ff0e6);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
                    #ttvab-welcome .pill{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#2ff0e6;border:1px solid rgba(47,240,230,.45);border-radius:999px;padding:2px 8px;background:rgba(47,240,230,.08)}
                    #ttvab-welcome-close{position:absolute;top:10px;right:12px;background:none;border:none;color:#b7a6e6;font-size:18px;cursor:pointer;padding:2px;line-height:1;transition:color .15s ease}
                    #ttvab-welcome-close:hover{color:#fff}
                    #ttvab-welcome .title{margin:0 0 4px;font-size:17px;font-weight:700;color:#fff}
                    #ttvab-welcome .sub{margin:0 0 12px;color:#b7a6e6}
                    #ttvab-welcome .pin-tip{display:flex;align-items:flex-start;gap:10px;background:rgba(46,18,84,.5);border:1px solid rgba(145,70,255,.35);border-radius:10px;padding:10px 12px;font-size:12.5px;color:#d9ccff}
                    #ttvab-welcome .pin-tip .tip-icon{font-size:15px;line-height:1.3}
                    #ttvab-welcome .pin-tip strong{display:block;color:#fff;margin-bottom:1px}
                    #ttvab-welcome .progress{position:absolute;left:0;right:0;bottom:0;height:2px;transform-origin:left;background:linear-gradient(90deg,#ff3db4,#9146FF,#2ff0e6);animation:ttvab-welcome-bar 10s linear forwards}
                    @keyframes ttvab-welcome-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
                    @media (prefers-reduced-motion:reduce){#ttvab-welcome{animation:none}#ttvab-welcome .progress{animation:none;transform:scaleX(1)}}
                </style>
                <button id="ttvab-welcome-close">×</button>
                <div class="brand">
                    <img class="mark" alt="" />
                    <div class="name">TTV&nbsp;AB</div>
                    <div class="pill"></div>
                </div>
                <div class="title"></div>
                <p class="sub"></p>
                <div class="pin-tip">
                    <span class="tip-icon">📌</span>
                    <span><strong class="pin-title"></strong><span class="pin-body"></span></span>
                </div>
                <div class="progress"></div>
            `;

			const markImage = toast.querySelector("img.mark");
			if (markImage instanceof HTMLImageElement) {
				markImage.src = _UI_ICON_SRC;
			}
			const text = _getPageText();
			toast.lang = _getPageLanguage().localeTag;
			_setToastText(toast, ".pill", text.welcomePill);
			_setToastText(toast, ".title", text.welcomeTitle);
			_setToastText(toast, ".sub", text.welcomeBody);
			_setToastText(toast, ".pin-title", text.pinTitle);
			_setToastText(toast, ".pin-body", text.pinBody);
			toast
				.querySelector("#ttvab-welcome-close")
				?.setAttribute("aria-label", text.dismiss);

			document.body.appendChild(toast);
			_setUiStorageItem(_FIRST_RUN_KEY, "true");

			const closeHandler = () => {
				toast.style.animation = "ttvab-welcome-out .3s ease forwards";
				setTimeout(() => toast.remove(), 300);
			};

			const welcomeClose = toast.querySelector("#ttvab-welcome-close");
			if (welcomeClose) {
				welcomeClose.onclick = closeHandler;
			}

			if (uiFlags.welcomeDismissTimer)
				clearTimeout(uiFlags.welcomeDismissTimer);
			uiFlags.welcomeDismissTimer = setTimeout(() => {
				uiFlags.welcomeDismissTimer = null;
				if (toast.isConnected) closeHandler();
			}, 10000);
		}, 2000);
	} catch (e) {
		_log(`Welcome message error: ${e.message}`, "error");
	}
}

const _ACHIEVEMENT_INFO = {
	first_block: { name: "Ad Slayer", icon: "⚔️", desc: "Blocked your first ad!" },
	block_10: { name: "Blocker", icon: "🛡️", desc: "Blocked 10 ads!" },
	block_100: { name: "Guardian", icon: "🔰", desc: "Blocked 100 ads!" },
	block_500: { name: "Sentinel", icon: "🏰", desc: "Blocked 500 ads!" },
	block_1000: { name: "Legend", icon: "🏆", desc: "Blocked 1000 ads!" },
	block_5000: { name: "Mythic", icon: "👑", desc: "Blocked 5000 ads!" },
	time_1h: { name: "Hour Saver", icon: "⏱️", desc: "Saved 1 hour from ads!" },
	time_10h: {
		name: "Time Master",
		icon: "⏰",
		desc: "Saved 10 hours from ads!",
	},
	channels_5: {
		name: "Explorer",
		icon: "📺",
		desc: "Blocked ads on 5 channels!",
	},
	channels_20: {
		name: "Adventurer",
		icon: "🌍",
		desc: "Blocked ads on 20 channels!",
	},
	block_10000: {
		name: "Diamond",
		icon: "💎",
		desc: "Blocked 10,000 ads!",
	},
	channels_50: {
		name: "Globetrotter",
		icon: "🗺️",
		desc: "Blocked ads on 50 channels!",
	},
};

function _ensureAchievementToastStyles() {
	if (document.getElementById("ttvab-achievement-style")) return;
	const style = document.createElement("style");
	style.id = "ttvab-achievement-style";
	style.textContent =
		"#ttvab-achievement{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);color:#fff;padding:16px 24px;border-radius:16px;font-family:'Segoe UI',sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5),0 0 20px rgba(145,70,255,.3);z-index:9999999;animation:ttvab-ach-pop .5s cubic-bezier(0.34,1.56,0.64,1);border:2px solid rgba(145,70,255,.5);display:flex;align-items:center;gap:16px}" +
		"@keyframes ttvab-ach-pop{from{opacity:0;transform:translateX(-50%) scale(.5) translateY(-20px)}to{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}" +
		"@keyframes ttvab-ach-shine{0%{background-position:-200% center}100%{background-position:200% center}}" +
		"#ttvab-achievement .ach-icon{font-size:40px;animation:ttvab-ach-bounce 1s ease infinite}" +
		"@keyframes ttvab-ach-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}" +
		"#ttvab-achievement .ach-content{display:flex;flex-direction:column;gap:2px}" +
		"#ttvab-achievement .ach-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9146FF;font-weight:600}" +
		"#ttvab-achievement .ach-name{font-size:18px;font-weight:700;background:linear-gradient(90deg,#fff 0%,#9146FF 50%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:ttvab-ach-shine 2s linear infinite}" +
		"#ttvab-achievement .ach-desc{font-size:12px;color:#aaa;margin-top:2px}" +
		"#ttvab-achievement.leaving{animation:ttvab-ach-pop .5s ease reverse forwards}" +
		"@media (prefers-reduced-motion:reduce){#ttvab-achievement,#ttvab-achievement .ach-icon,#ttvab-achievement .ach-name{animation:none}#ttvab-achievement.leaving{animation:none;visibility:hidden}}";
	document.head?.appendChild(style);
}

function _showAchievementUnlocked(achievementId) {
	try {
		if (
			window.top !== window ||
			_pageStatsPaused ||
			typeof achievementId !== "string" ||
			!Object.hasOwn(_ACHIEVEMENT_INFO, achievementId)
		)
			return;
		const uiFlags = _getUiFlags();
		const ach = _ACHIEVEMENT_INFO[achievementId];

		if (!document.body) return;
		_ensureAchievementToastStyles();
		const existing = document.getElementById("ttvab-achievement");
		if (existing) existing.remove();

		const { language, localeTag } = _getPageLanguage();
		const achievementText =
			_PAGE_ACHIEVEMENT_TEXT[language]?.[achievementId] || ach;
		const toast = document.createElement("div");
		toast.id = "ttvab-achievement";
		toast.lang = localeTag;
		const icon = document.createElement("div");
		icon.className = "ach-icon";
		icon.textContent = String(ach.icon ?? "");

		const content = document.createElement("div");
		content.className = "ach-content";

		const label = document.createElement("div");
		label.className = "ach-label";
		label.textContent = _getPageText().achievementUnlocked;

		const name = document.createElement("div");
		name.className = "ach-name";
		name.textContent = String(achievementText.name ?? "");

		const desc = document.createElement("div");
		desc.className = "ach-desc";
		desc.textContent = String(achievementText.desc ?? "");

		content.append(label, name, desc);
		toast.append(icon, content);

		document.body.appendChild(toast);
		_log(`Achievement unlocked: ${ach.name}`, "success");

		if (uiFlags.achievementDismissTimer)
			clearTimeout(uiFlags.achievementDismissTimer);
		uiFlags.achievementDismissTimer = setTimeout(() => {
			uiFlags.achievementDismissTimer = null;
			if (toast.isConnected) {
				toast.classList.add("leaving");
				if (uiFlags.achievementRemoveTimer)
					clearTimeout(uiFlags.achievementRemoveTimer);
				uiFlags.achievementRemoveTimer = setTimeout(() => {
					uiFlags.achievementRemoveTimer = null;
					toast.remove();
				}, 500);
			}
		}, 5000);
	} catch (e) {
		_log(`Achievement error: ${e.message}`, "error");
	}
}

function _initAchievementListener() {
	const uiFlags = _getUiFlags();
	if (uiFlags.achievementListenerInitialized) return;
	uiFlags.achievementListenerInitialized = true;
	_onInternalMessage("ttvab-achievement-unlocked", (detail) => {
		const safeDetail =
			detail && typeof detail === "object" && !Array.isArray(detail)
				? detail
				: null;
		if (typeof safeDetail?.id !== "string") return;
		_showAchievementUnlocked(safeDetail.id);
	});
}
