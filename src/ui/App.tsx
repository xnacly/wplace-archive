import { useLayoutEffect, useState, useRef, useCallback, useMemo, useEffect, AnchorHTMLAttributes } from "react";
import Timeline from "./Timeline";
import { ColorSpecification, LayerSpecification, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import layers from "./mapstyle.json";
import "./util";
import { getImageFromMap } from "./util";
import canvasSize from "canvas-size";
import { BankTransfer } from "./BankTransfer";
import { Donate } from "./Donate";
import { About } from "./About";
import { Crypto } from "./Crypto";
// @ts-ignore
import { useEvent } from "./use-event.js";

// const TILE_URL = 'http://localhost:8000/{z}/{x}/{y}.png'; // gdal2tiles output
const TILE_SIZE = 512; // must match --tilesize used in gdal2tiles

const WORLD_N = 85.0511287798066; // top latitude in EPSG:3857

// Times available for the time-travel tile layers. Use valid ISO strings (Map overlay folders use ':' replaced by '-').
const timeStrings: string[] = [
	// "now",
	// "2025-08-31T14:13:41.477Z",
	// "2025-08-31T11:15:49.042Z",
	// "2025-08-31T08:17:38.125Z",
	// "2025-08-31T05:20:54.654Z",
	// "2025-08-31T02:23:54.630Z",
	// "2025-08-30T23:25:16.459Z",
	// "2025-08-30T20:26:19.217Z",
	// "2025-08-30T17:25:07.835Z",
	"2025-10-11T13:55:18.919Z",
	"2025-10-04T12:28:23.768Z",
	"2025-09-22T17:49:18.014Z",
	"2025-09-13T14:53:56.640Z",
	"2025-09-09T11:58:48.527Z",
	"2025-08-25T21:47:23.259Z",
	"2025-08-22T11:34:06.282Z",
	"2025-08-09T20:01:14.231Z",
	// add further timestamps here
];
const defaultTimes = timeStrings.map((s) => new Date(s));

function fixTimestamp(ts: string) {
	// only fix the time section
	return ts.replace(/T(\d+)-(\d+)-(\d+\.\d+Z)/, "T$1:$2:$3");
}

function toISOString(d: Date) {
	if (isNaN(d.getTime())) return "now";

	return d.toISOString();
}

function timeSlug(d: Date) {
	if (!d) return "";
	if (isNaN(d.getTime())) return "now";

	// Folder naming: replace ':' with '-' to be filesystem friendly, keep milliseconds & Z
	return toISOString(d).replace(/:/g, "-");
}

function recoverIsoFromSlug(slug: string) {
	// Convert 2025-08-31T14-13-41.477Z back to 2025-08-31T14:13:41.477Z (only replace the two '-' after 'T')
	return slug.replace(/T(\d{2})-(\d{2})-(\d{2}\.\d{3}Z)$/, (m, h, mi, rest) => `T${h}:${mi}:${rest}`);
}

function parseHash(): Record<string, string> {
	if (typeof window === "undefined") return {};
	const h = window.location.hash.replace(/^#/, "");
	if (!h) return {};
	const out: Record<string, string> = {};
	h.split("&").forEach((pair) => {
		const [k, v] = pair.split("=").map(decodeURIComponent);
		if (k) out[k] = v ?? "";
	});
	return out;
}

function buildHash(params: Record<string, any>) {
	const parts = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null && v !== "")
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
	return "#" + parts.join("&");
}

const branchesPromise = fetch("https://api.github.com/repositories/1043382281/branches").then((x) => x.json());

function App() {
	const [selectionChanged, setSelectionChanged] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const mapRef = useRef<Map | null>(null);
	const mapReadyRef = useRef(false);
	const [forceUpdate, setForceUpdate] = useState(0);
	const [isAboutOpen, setIsAboutOpen] = useState(false);
	const [isDonateOpen, setIsDonateOpen] = useState(false);
	const [isCryptoOpen, setIsCryptoOpen] = useState(false);
	const [isBankTransferOpen, setIsBankTransferOpen] = useState(false);

	const [times, setTimes] = useState<Date[]>(defaultTimes);
	const [pendingHashTime, setPendingHashTime] = useState<string | null>(null);

	const [isTakingScreenshot, setIsTakingScreenshot] = useState(false);
	const progressBarRef = useRef<HTMLProgressElement>(null);
	const progressTextRef = useRef<HTMLDivElement>(null);
	const [errorScreenshot, setErrorScreenshot] = useState<string | null>(null);

	// On first render, parse hash for initial state (center, zoom, time)
	const initialViewRef = useRef<{ center?: [number, number]; zoom?: number }>({});
	if (!initialViewRef.current.center) {
		const params = parseHash();
		applyHashParams(params, initialViewRef.current, setPendingHashTime);
	}

	// Helper to apply hash params to view/time state
	function applyHashParams(
		params: Record<string, string>,
		view: { center?: [number, number]; zoom?: number } = {},
		setTime?: (slug: string) => void
	) {
		const lat = params.lat ? parseFloat(params.lat) : undefined;
		const lng = params.lng ? parseFloat(params.lng) : undefined;
		const z = params.z ? parseFloat(params.z) : undefined;
		if (isFinite(lat!) && isFinite(lng!)) view.center = [lng!, lat!];
		if (isFinite(z!)) view.zoom = z!;
		if (params.time && setTime) setTime(params.time);
		return view;
	}

	// Wrapper applying params directly to a live map instance
	const applyParamsToMap = useCallback((params: Record<string, string>) => {
		const m = mapRef.current;
		const view = applyHashParams(params, {}, setPendingHashTime);
		if (!m) return;
		if (view.center) m.setCenter(view.center);
		if (view.zoom !== undefined) m.setZoom(view.zoom);
	}, []);

	// Central hash sync (uses current map + selected time)
	const syncHash = useEvent(() => {
		const m = mapRef.current;
		if (!m) return;
		const c = m.getCenter();
		const z = m.getZoom();
		const currentTimeLocal = times[selectedIndex];
		const slug = timeSlug(currentTimeLocal);
		const newHash = buildHash({ z: z.toFixed(2), lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), time: slug });
		if (window.location.hash !== newHash) window.history.replaceState(null, "", newHash);
		setSelectionChanged(false);

		if (selectionChanged) return;

		// unload all other layers which aren't active
		console.log("synchash");

		const otherLayers = m.getStyle()?.layers?.filter((l) => l.id.startsWith("tiles-") && l.id !== `tiles-${currentSlug}`) || [];
		otherLayers.forEach((l) => {
			const otherLayer = m.getLayer(l.id);
			if (!otherLayer) return;

			m.setLayoutProperty(l.id, "visibility", "none");
		});
	}, [times, selectedIndex, selectionChanged]);

	useLayoutEffect(() => {
		branchesPromise.then((branches: any) => {
			const times: Date[] = branches
				.filter((x: any) => x.name.startsWith("tiles/world-"))
				.map((x: any) => new Date(fixTimestamp(x.name.replace("tiles/world-", ""))));
			if (!times.length) return;
			return;

			setTimes([new Date("now"), ...times.sort((a, b) => a.getTime() - b.getTime())]);
		});
	}, []);

	const currentTime = times[selectedIndex];
	const currentSlug = timeSlug(currentTime);

	useLayoutEffect(() => {
		const map = new Map({
			container: "map",
			style: {
				version: 8,
				sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
				glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
				sources: {
					ne2_shaded: {
						maxzoom: 6,
						tileSize: 256,
						tiles: ["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"],
						type: "raster",
					},
					openmaptiles: {
						type: "vector",
						url: "https://tiles.openfreemap.org/planet",
					},
					...Object.fromEntries(
						defaultTimes.map((time) => {
							return [
								`tiles-${timeSlug(time)}`,
								{
									type: "raster",
									tiles: [`https://wplace.samuelscheit.com/tiles/world-${timeSlug(time)}/{z}/{x}/{y}.png`],
									tileSize: TILE_SIZE,
									scheme: "xyz",
								},
							];
						})
					),
				},
				layers: [
					{
						id: "background",
						type: "background",
						paint: {
							"background-color": "#f8f4f0",
						},
					},
					...(layers as any),
					...defaultTimes.map((x) => {
						const visibility = timeSlug(x) === currentSlug ? "visible" : "none";

						return {
							id: `tiles-${timeSlug(x)}`,
							type: "raster",
							source: `tiles-${timeSlug(x)}`,
							paint: {
								"raster-resampling": "nearest",
								"raster-opacity": 1,
							},

							layout: {
								visibility, // visible
								// visibility: "visible", // visible
							},
						};
					}),
				],
			},
			renderWorldCopies: false,
			center: initialViewRef.current.center || [0, WORLD_N / 3],
			zoom: initialViewRef.current.zoom ?? 2,
		});

		mapRef.current = map;
		// @ts-ignore
		globalThis.map = map;
		map.on("load", () => {
			mapReadyRef.current = true;
			setForceUpdate((i) => i + 1);
		});

		// React to manual hash edits
		const onHashChange = () => applyParamsToMap(parseHash());
		window.addEventListener("hashchange", onHashChange);

		return () => {
			map.remove();
			mapRef.current = null;
			mapReadyRef.current = false;
			window.removeEventListener("hashchange", onHashChange);
		};
		// re-create map only once; time changes handled separately
	}, []);

	useLayoutEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		map.on("moveend", syncHash);

		return () => {
			map.off("moveend", syncHash);
		};
	}, [syncHash]);

	// Update raster source when the selected time changes
	useLayoutEffect(() => {
		if (!currentSlug) return;

		const map = mapRef.current;
		if (!map || !mapReadyRef.current) return;

		const layer = map.getLayer(`tiles-${currentSlug}`);
		if (!layer) return;

		map.setLayoutProperty(`tiles-${currentSlug}`, "visibility", "visible");
		map.setPaintProperty(`tiles-${currentSlug}`, "raster-opacity", 1);

		const otherLayers = map.getStyle().layers?.filter((l) => l.id.startsWith("tiles-") && l.id !== `tiles-${currentSlug}`) || [];
		otherLayers.forEach((l) => {
			const otherLayer = map.getLayer(l.id);
			if (!otherLayer) return;

			map.setPaintProperty(l.id, "raster-opacity", 0);
			if (selectionChanged) {
				setTimeout(() => {
					map.setLayoutProperty(l.id, "visibility", "visible");
				}, 100);
			}
		});

		setTimeout(() => {
			map.triggerRepaint();
		}, 150);
	}, [currentSlug, forceUpdate]);

	const onSelect = useCallback((idx: number) => {
		setSelectedIndex(idx);
		setSelectionChanged(true);
	}, []);

	const takeScreenshot = async () => {
		setIsTakingScreenshot(true);
		// if (!isTakingScreenshot) return;
		// if (!mapRef.current || !previewCanvasRef.current) return;
		if (!mapRef.current) return;
		// if (previousCanvasRef.current === previewCanvasRef.current) return;

		// previousCanvasRef.current = previewCanvasRef.current;
		let canvas = undefined as any as OffscreenCanvas;

		try {
			const generator = getImageFromMap(mapRef.current);
			for await (const update of generator) {
				if (update.type === "start") {
					// canvas is ready
					canvas = update.canvas as any;
				} else if (update.type === "progress" && update.loaded !== undefined) {
					if (progressBarRef.current) {
						progressBarRef.current.value = update.loaded / update.total;
					}
					if (progressTextRef.current) {
						progressTextRef.current.textContent = `Progress: ${Math.round((update.loaded / update.total) * 100)}%`;
					}
				}
			}

			const blob = await canvas.convertToBlob({
				type: "image/png",
			});

			const a = document.createElement("a");

			const url = URL.createObjectURL(blob);
			a.href = url;
			a.download = "wplace.png";
			a.click();
			URL.revokeObjectURL(url);

			setIsTakingScreenshot(false);

			// @ts-ignore
			globalThis?.plausible?.("screenshot");
		} catch (error) {
			// @ts-ignore
			globalThis?.plausible?.("screenshot_error");
			console.error("Screenshot error", error);
			if (error instanceof Error && error.message.includes("Maximum call stack size exceeded")) {
				setErrorScreenshot("The requested screenshot is too large. Please zoom further in and try again.");
			} else {
				setErrorScreenshot((error as Error).message);
			}
		}
	};

	const openAbout = useCallback(() => {
		// @ts-ignore
		globalThis?.plausible?.("about");

		const lang = globalThis.navigator?.language?.split("-")[0] || "en";
		// @ts-ignore
		globalThis.googleTranslateElementInit = () => {
			console.log("init translate");
			document.cookie = `googtrans=/en/${lang}; path=/; `;
			// @ts-ignore
			new google.translate.TranslateElement(
				// @ts-ignore
				{ pageLanguage: "en", layout: google.translate.TranslateElement.InlineLayout.HORIZONTAL },
				"google_translate_element"
			);
		};
		const script = document.createElement("script");
		script.type = "text/javascript";
		script.src = "//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";

		if (
			!document.querySelector('script[src="//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"]') &&
			lang !== "en"
		) {
			globalThis.document.body.appendChild(script);
		}

		setIsAboutOpen(true);
	}, []);
	const closeAbout = useCallback(() => setIsAboutOpen(false), []);
	const openDonate = useCallback(() => {
		// @ts-ignore
		globalThis?.plausible?.("donate");

		setIsDonateOpen(true);
	}, []);
	const closeDonate = useCallback(() => setIsDonateOpen(false), []);
	const openBankTransfer = useCallback(() => {
		setIsBankTransferOpen(true);
	}, []);
	const closeBankTransfer = useCallback(() => setIsBankTransferOpen(false), []);
	const openCrypto = useCallback(() => {
		setIsCryptoOpen(true);
	}, []);
	const closeCrypto = useCallback(() => setIsCryptoOpen(false), []);

	useEffect(() => {
		if (!isAboutOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeAbout();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isAboutOpen, closeAbout]);

	useEffect(() => {
		if (!isDonateOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeDonate();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isDonateOpen, closeDonate]);

	useEffect(() => {
		if (!isBankTransferOpen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				closeBankTransfer();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [isBankTransferOpen, closeBankTransfer]);

	// Apply pending hash time once times are known
	useEffect(() => {
		if (!pendingHashTime || !times.length) return;
		const slug = pendingHashTime;
		// Try slug direct match or ISO match
		let idx = times.findIndex((t) => timeSlug(t) === slug);
		if (idx === -1) {
			const isoCandidate = recoverIsoFromSlug(slug);
			idx = times.findIndex((t) => toISOString(t) === isoCandidate);
		}
		if (idx >= 0) {
			setSelectedIndex(idx);
			setPendingHashTime(null);
		}
	}, [pendingHashTime, times]);

	// When selected time changes, update hash (keeping current map center/zoom)
	useLayoutEffect(() => {
		syncHash();
	}, [selectedIndex, times, syncHash]);

	// Group times by calendar day (YYYY-MM-DD) preserving original order
	interface DayGroup {
		key: string;
		date: Date;
		items: { date: Date; index: number }[];
	}
	const dayGroups = useMemo<DayGroup[]>(() => {
		const dayMap = new globalThis.Map<string, DayGroup>();
		for (let i = 0; i < times.length; i++) {
			const d = times[i];

			let key = d.toLocaleDateString(navigator.language, {
				month: "short",
				day: "2-digit",
			}); // YYYY-MM-DD

			if (isNaN(d.getTime())) key = "Now";

			if (!dayMap.has(key)) dayMap.set(key, { key, date: new Date(key + "T00:00:00Z"), items: [] });
			dayMap.get(key)!.items.push({ date: d, index: i });
		}
		return Array.from(dayMap.values());
	}, [times]);

	// Simple keyboard navigation
	useLayoutEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === "ArrowLeft") setSelectedIndex((i) => Math.max(0, i - 1));
			else if (e.key === "ArrowRight") setSelectedIndex((i) => Math.min(times.length - 1, i + 1));
		}
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return (
		<>
			<div id="map" />
			<div className="absolute left-2 top-2 flex flex-col gap-2 z-10 text-xs font-medium text-neutral-100 justify-start items-start">
				<button
					type="button"
					onClick={openAbout}
					className="rounded bg-neutral-900/70 px-3 py-1 shadow-md backdrop-blur font-semibold flex flex-row items-center gap-2 cursor-pointer hover:bg-neutral-800/70 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-200"
					aria-haspopup="dialog"
					aria-expanded={isAboutOpen}
					aria-controls="about-modal"
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-3" aria-hidden="true">
						<path
							fill="currentColor"
							d="M256 512a256 256 0 1 0 0-512 256 256 0 1 0 0 512zM224 160a32 32 0 1 1 64 0 32 32 0 1 1 -64 0zm-8 64l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"
						/>
					</svg>
					About
				</button>
				<div className="pointer-events-none rounded bg-neutral-900/70 px-3 py-1 shadow-md backdrop-blur">
					<span className="text-neutral-400 mr-1">Current:</span>
					{isNaN(currentTime.getTime())
						? "Now"
						: currentTime?.toLocaleString(window.navigator.language, {
								month: "short",
								day: "2-digit",
								hour: "2-digit",
								minute: "2-digit",
							})}
				</div>
			</div>
			<div className="absolute right-2 top-2 z-10">
				<button
					onClick={() => {
						// setIsTakingScreenshot(true);
						takeScreenshot();
					}}
					disabled={isTakingScreenshot}
					className="rounded bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-100 shadow-md backdrop-blur hover:bg-neutral-800/70 disabled:opacity-50"
				>
					{isTakingScreenshot ? "Taking..." : "Screenshot"}
				</button>
			</div>
			{isTakingScreenshot && (
				<div className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center">
					{errorScreenshot ? (
						<div className="bg-white p-4 rounded shadow-lg text-black max-w-md text-center flex flex-col items-center">
							<p className="whitespace-pre-wrap">{errorScreenshot}</p>

							<button
								onClick={() => {
									setErrorScreenshot(null);
									setIsTakingScreenshot(false);
								}}
								className="mt-4 rounded bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-100 shadow-md backdrop-blur hover:bg-neutral-800/70"
							>
								Close
							</button>
						</div>
					) : (
						<div className="bg-white p-4 rounded shadow-lg text-black">
							<div className="text-sm mb-2">Generating screenshot...</div>
							<div ref={progressTextRef} className="text-xs mb-2">
								Progress: 0%
							</div>
							<progress ref={progressBarRef} max={1} className="w-full mb-4" />
							{/* <canvas
							ref={(r) => {
								previewCanvasRef.current = r;
								if (!r) return;
								console.log("ref changed", r);
								takeScreenshot();
							}}
							style={{ width: "200px", height: "200px" }}
							className="border"
						/> */}
						</div>
					)}
				</div>
			)}
			{/* Timeline overlay */}
			<div className="absolute left-0 right-0 bottom-0 z-10 bg-gradient-to-t from-neutral-900/80 to-neutral-900/40">
				<Timeline dayGroups={dayGroups} selectedIndex={selectedIndex} onSelect={onSelect} />
			</div>
			{isAboutOpen && <About closeAbout={closeAbout} mapRef={mapRef} openBankTransfer={openBankTransfer} openDonate={openDonate} />}
			{isBankTransferOpen && <BankTransfer closeBankTransfer={closeBankTransfer} />}
			{isDonateOpen && <Donate openBankTransfer={openBankTransfer} closeDonate={closeDonate} openCrypto={openCrypto} />}
			{isCryptoOpen && <Crypto closeCrypto={closeCrypto} />}
		</>
	);
}

export default App;
