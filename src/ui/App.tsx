import { useLayoutEffect, useState, useRef, useCallback, useMemo, useEffect, AnchorHTMLAttributes } from "react";
import Timeline from "./Timeline";
import { ColorSpecification, LayerSpecification, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import layers from "./mapstyle.json";
import "./util";
import { getImageFromMap } from "./util";
import canvasSize from "canvas-size";

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

function DonateButton(props: AnchorHTMLAttributes<any> & { method?: string }) {
	return (
		<a
			{...props}
			target="_blank"
			rel="noreferrer"
			onClick={() => {
				// @ts-ignore
				globalThis?.plausible?.("donate_button", {
					props: {
						method: props.method,
					},
				});
			}}
			className={
				"inline-flex items-center justify-center gap-2 self-start rounded px-3 py-1.5 text-sm font-medium text-neutral-50 shadow " +
				props.className
			}
		/>
	);
}

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
	const [selectedIndex, setSelectedIndex] = useState(0);
	const mapRef = useRef<Map | null>(null);
	const mapReadyRef = useRef(false);
	const [forceUpdate, setForceUpdate] = useState(0);
	const [isAboutOpen, setIsAboutOpen] = useState(false);
	const [isDonateOpen, setIsDonateOpen] = useState(false);

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
	const syncHash = useCallback(() => {
		const m = mapRef.current;
		if (!m) return;
		const c = m.getCenter();
		const z = m.getZoom();
		const currentTimeLocal = times[selectedIndex];
		const slug = timeSlug(currentTimeLocal);
		const newHash = buildHash({ z: z.toFixed(2), lat: c.lat.toFixed(5), lng: c.lng.toFixed(5), time: slug });
		if (window.location.hash !== newHash) window.history.replaceState(null, "", newHash);
	}, [times, selectedIndex]);

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

	// Build tiles URL for the selected time
	let timeTilesUrl =
		currentSlug === "now"
			? `https://proxy293.flam3rboy.workers.dev/https://backend.wplace.live/files/s0/tiles/{x}/{y}.png`
			: `https://wplace.samuelscheit.com/tiles/world-${currentSlug}/{z}/{x}/{y}.png`;

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
					mytiles: {
						type: "raster",
						tiles: [timeTilesUrl],
						tileSize: TILE_SIZE,
						scheme: "xyz",
					},
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
					{
						id: "mytiles",
						type: "raster",
						source: "mytiles",
						paint: {
							"raster-resampling": "nearest",
							"raster-opacity": 1,
						},
					},
				],
			},
			renderWorldCopies: false,
			center: initialViewRef.current.center || [0, WORLD_N / 3],
			zoom: initialViewRef.current.zoom ?? 2,
		});

		mapRef.current = map;
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
		console.log("Updating tiles to", timeTilesUrl, currentSlug);
		if (!currentSlug) return;

		const map = mapRef.current;
		if (!map || !mapReadyRef.current) return;
		const src: any = map.getSource("mytiles");
		const newTiles = [timeTilesUrl];
		// If source API supports setTiles
		if (src && typeof src.setTiles === "function") {
			src.setTiles(newTiles);
			map.triggerRepaint();

			if (timeTilesUrl.includes("proxy293.flam3rboy.workers.dev")) {
				src.minzoom = 11;
			} else {
				src.minzoom = 0;
			}
		} else {
			// Fallback: remove and re-add source & layer
			if (map.getLayer("mytiles")) map.removeLayer("mytiles");
			if (map.getSource("mytiles")) map.removeSource("mytiles");
			map.addSource("mytiles", {
				type: "raster",
				tiles: newTiles,
				tileSize: TILE_SIZE,
				scheme: "xyz",
				maxzoom: 11,
			});
			map.addLayer({
				id: "mytiles",
				type: "raster",
				source: "mytiles",
				paint: { "raster-resampling": "nearest", "raster-opacity": 1 },
			});
		}
	}, [timeTilesUrl, forceUpdate]);

	const onSelect = useCallback((idx: number) => {
		setSelectedIndex(idx);
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
		} catch (error) {
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
			{isAboutOpen && (
				<div
					className="absolute inset-0 z-20 bg-black/50 flex items-center justify-center backdrop-blur-sm"
					role="presentation"
					onClick={closeAbout}
				>
					<div
						id="about-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="about-modal-title"
						className="bg-white/95 text-neutral-900 max-w-md w-[90%] rounded-lg shadow-xl p-6 space-y-4 max-h-screen overflow-y-auto"
						onClick={(event) => event.stopPropagation()}
					>
						<div id="google_translate_element" className="absolute top-0 left-0 right-0 z-10 bg-white hidden"></div>
						<div className="flex items-start justify-between gap-4">
							<h2 id="about-modal-title" className="text-lg font-semibold">
								About Wplace archive
							</h2>
							<button
								type="button"
								onClick={closeAbout}
								className="text-neutral-500 hover:text-neutral-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400 cursor-pointer"
								aria-label="Close about dialog"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className="size-4" aria-hidden="true">
									<path
										fill="currentColor"
										d="M310.6 361.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L160 301.3 54.6 406.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L114.7 256 9.4 150.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 210.7l105.4-105.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L205.3 256l105.3 105.4z"
									/>
								</svg>
							</button>
						</div>
						<div className="space-y-4">
							<img
								src="/samuelscheit.jpg"
								alt="Picture of Samuel Scheit"
								className="size-24 rounded-full mx-auto float-right mb-1 ml-1"
							/>
							<p>Hi I'm Samuel 👋</p>
							<p>
								I created the wplace archive to <span className="bold">preserve</span> the entire wplace map{" "}
								<span className="bold">history</span> <span className="bold">without zoom limits</span>.
							</p>

							<div>
								Behind the scenes every snapshot takes <span className="bold"> 12 hours </span> to render and needs{" "}
								<span className="bold">~24 GB</span>. I host this on a <span className="bold">$20/month server</span> with{" "}
								<span className="bold">200 GB disk space</span> (<span className="bold">84% used</span>, about room for one
								more snapshot).
							</div>

							<div>
								I'm currently paying <span className="codeblock">$20</span> a month to keep this project online with the
								help of <span className="codeblock">1</span> donater.
							</div>

							<div>
								If you like the archive and would like to help to keep it online, please consider donating. It would help me
								a lot to cover the costs. Thank you very much :)
							</div>

							<div>
								Also <span className="bold">huge thanks</span> to the <span className="bold">supporters</span> (
								<span className="bg-gray-500/10 ">Nicolas Rodriguez</span>) who make preserving wplace possible and thank
								you to{" "}
								<a
									href="https://github.com/murolem/wplace-archives/"
									target="_blank"
									rel="noreferrer"
									className="text-cyan-800 italic bold"
								>
									Vladislav Suchkov
								</a>{" "}
								who backups the entire world map every three hours.
							</div>

							<div className="flex justify-center pt-2 flex-row gap-2">
								<button
									type="button"
									onClick={openDonate}
									className="inline-flex items-center gap-2 rounded bg-red-500/70 px-4 py-2 text-sm font-semibold text-neutral-100 shadow-md backdrop-blur hover:bg-red-600/70 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4" aria-hidden="true">
										<path
											fill="white"
											d="M241 87.1l15 20.7 15-20.7C296 52.5 336.2 32 378.9 32 452.4 32 512 91.6 512 165.1l0 2.6c0 112.2-139.9 242.5-212.9 298.2-12.4 9.4-27.6 14.1-43.1 14.1s-30.8-4.6-43.1-14.1C139.9 410.2 0 279.9 0 167.7l0-2.6C0 91.6 59.6 32 133.1 32 175.8 32 216 52.5 241 87.1z"
										/>
									</svg>
									Donate
								</button>
								{globalThis?.navigator?.share && (
									<button
										onClick={() => {
											if (!globalThis.navigator.share) return;
											const m = mapRef.current;
											if (!m) return;

											globalThis.navigator
												.share({
													url: window.location.href,
												})
												.catch((error) => {
													console.error("Error sharing", error);
												});
										}}
										className="inline-flex items-center gap-2 rounded bg-blue-600/70 px-4 py-2 text-sm font-semibold text-neutral-100 shadow-md backdrop-blur hover:bg-blue-700/70 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
									>
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4" aria-hidden="true">
											<path
												fill="white"
												d="M307.8 18.4c-12 5-19.8 16.6-19.8 29.6l0 80-112 0c-97.2 0-176 78.8-176 176 0 113.3 81.5 163.9 100.2 174.1 2.5 1.4 5.3 1.9 8.1 1.9 10.9 0 19.7-8.9 19.7-19.7 0-7.5-4.3-14.4-9.8-19.5-9.4-8.8-22.2-26.4-22.2-56.7 0-53 43-96 96-96l96 0 0 80c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l160-160c12.5-12.5 12.5-32.8 0-45.3l-160-160c-9.2-9.2-22.9-11.9-34.9-6.9z"
											/>
										</svg>
										Share
									</button>
								)}
							</div>

							<div className="text-center text-xs text-neutral-500 flex flex-col gap-2">
								<span>
									Made with ❤️ by{" "}
									<a
										href="https://samuelscheit.com"
										target="_blank"
										rel="noreferrer"
										className="text-cyan-800 italic bold"
									>
										Samuel Scheit
									</a>
								</span>
								<div className="text-center text-[0.6rem] text-neutral-500">
									Source code on{" "}
									<a
										href="https://github.com/samuelscheit/wplace-archive"
										target="_blank"
										rel="noreferrer"
										className="text-slate-600 italic bold"
									>
										GitHub
									</a>
								</div>
							</div>
						</div>
					</div>
				</div>
			)}
			{isDonateOpen && (
				<div
					className="absolute inset-0 z-20 bg-black/60 flex items-center justify-center backdrop-blur-sm"
					role="presentation"
					onClick={closeDonate}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-labelledby="donation-modal-title"
						className="bg-white/95 text-neutral-900 max-w-lg w-[92%] rounded-lg shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="flex items-start justify-between gap-4">
							<div>
								<h2 id="donation-modal-title" className="text-lg font-semibold">
									Choose how you’d like to support
								</h2>
								<p className="text-sm text-neutral-600">
									Every contribution helps to keep the archive online and lets me create snapshots more often.
								</p>
							</div>
							<button
								type="button"
								onClick={closeDonate}
								className="text-neutral-500 hover:text-neutral-700 focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
								aria-label="Close donation dialog"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" className="size-4" aria-hidden="true">
									<path
										fill="currentColor"
										d="M310.6 361.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L160 301.3 54.6 406.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L114.7 256 9.4 150.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 210.7l105.4-105.4c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L205.3 256l105.3 105.4z"
									/>
								</svg>
							</button>
						</div>

						<div className="flex flex-row gap-2 text-white flex-wrap items-stretch">
							<DonateButton href="https://www.paypal.me/samuelscheit" style={{ backgroundColor: "#0070e0" }} method="paypal">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
									<path
										fill="currentColor"
										d="M111.9 295.9c-3.5 19.2-17.4 108.7-21.5 134-.3 1.8-1 2.5-3 2.5l-74.6 0c-7.6 0-13.1-6.6-12.1-13.9L59.3 46.6c1.5-9.6 10.1-16.9 20-16.9 152.3 0 165.1-3.7 204 11.4 60.1 23.3 65.6 79.5 44 140.3-21.5 62.6-72.5 89.5-140.1 90.3-43.4 .7-69.5-7-75.3 24.2zM357.6 152c-1.8-1.3-2.5-1.8-3 1.3-2 11.4-5.1 22.5-8.8 33.6-39.9 113.8-150.5 103.9-204.5 103.9-6.1 0-10.1 3.3-10.9 9.4-22.6 140.4-27.1 169.7-27.1 169.7-1 7.1 3.5 12.9 10.6 12.9l63.5 0c8.6 0 15.7-6.3 17.4-14.9 .7-5.4-1.1 6.1 14.4-91.3 4.6-22 14.3-19.7 29.3-19.7 71 0 126.4-28.8 142.9-112.3 6.5-34.8 4.6-71.4-23.8-92.6z"
									/>
								</svg>
								PayPal
							</DonateButton>
							<DonateButton
								href="https://buymeacoffee.com/samuelscheit"
								style={{ backgroundColor: "#52a447" }}
								method="buymeacoffee"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
									<path
										fill="white"
										d="M0 128l0 32 512 0 0-32c0-35.3-28.7-64-64-64L64 64C28.7 64 0 92.7 0 128zm0 80L0 384c0 35.3 28.7 64 64 64l384 0c35.3 0 64-28.7 64-64l0-176-512 0zM64 360c0-13.3 10.7-24 24-24l48 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-48 0c-13.3 0-24-10.7-24-24zm144 0c0-13.3 10.7-24 24-24l64 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-64 0c-13.3 0-24-10.7-24-24z"
									/>
								</svg>
								Credit Card
							</DonateButton>
							<DonateButton
								href="https://www.patreon.com/samuelscheit"
								style={{ backgroundColor: "#F96854" }}
								method="patreon"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
									<path
										fill="currentColor"
										d="M490 153.8c-.1-65.4-51-119-110.7-138.3-74.2-24-172-20.5-242.9 12.9-85.8 40.5-112.8 129.3-113.8 217.8-.8 72.8 6.4 264.4 114.6 265.8 80.3 1 92.3-102.5 129.5-152.3 26.4-35.5 60.5-45.5 102.4-55.9 72-17.8 121.1-74.7 121-150l-.1 0z"
									/>
								</svg>
								Patreon
							</DonateButton>
							<DonateButton
								href="https://github.com/sponsors/samuelscheit"
								style={{ backgroundColor: "#000" }}
								method="github"
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
									<path
										fill="currentColor"
										d="M173.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3 .3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9 .3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM252.8 8c-138.7 0-244.8 105.3-244.8 244 0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1 100-33.2 167.8-128.1 167.8-239 0-138.7-112.5-244-251.2-244zM105.2 352.9c-1.3 1-1 3.3 .7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9 1.6 1 3.6 .7 4.3-.7 .7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3 .7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
									/>
								</svg>
								GitHub
							</DonateButton>
							<DonateButton href="https://qr.alipay.com/fkx175153zjoblrjcwh4ode" style={{ backgroundColor: "#0e9dec" }} method="alipay">
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" className="size-4">
									<path
										fill="currentColor"
										d="M377.7 32L70.3 32C31.4 32 0 63.4 0 102.3L0 409.7C0 448.6 31.4 480 70.3 480l307.5 0c38.5 0 69.8-31.1 70.3-69.6-46-25.6-110.6-60.3-171.6-88.4-32.1 44-84.1 81-148.6 81-70.6 0-93.7-45.3-97-76.4-4-39 14.9-81.5 99.5-81.5 35.4 0 79.4 10.2 127.1 25 16.5-30.1 26.5-60.3 26.5-60.3l-178.2 0 0-16.7 92.1 0 0-31.2-109.4 0 0-19 109.4 0 0-50.4 50.9 0 0 50.4 109.4 0 0 19-109.4 0 0 31.2 88.8 0s-15.2 46.6-38.3 90.9c48.9 16.7 100 36 148.6 52.7l0-234.4c.2-38.7-31.2-70.3-69.9-70.3zM47.3 323c1 20.2 10.2 53.7 69.9 53.7 52.1 0 92.6-39.7 117.9-72.9-44.6-18.7-84.5-31.4-109.4-31.4-67.4 0-79.4 33.1-78.4 50.6z"
									/>
								</svg>
								AliPay
							</DonateButton>
							<DonateButton
								href="https://share.weropay.eu/p/1/c/TEtPuXbCOj"
								style={{ backgroundColor: "#0e9dec", height: "32px" }}
								method="wero"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									id="svg627"
									version="1.1"
									width="1024"
									height="247"
									viewBox="-1.23 -1.23 180.37016 43.46"
									className="w-10 h-auto h-min-full"
								>
									<defs id="defs624">
										<linearGradient
											data-v-0fa15ece=""
											gradientUnits="userSpaceOnUse"
											y2="40.3102"
											x2="74.754501"
											y1="18.026199"
											x1="92.743698"
											id="paint0_linear_2020_2049-header"
										>
											<stop id="stop572" data-v-0fa15ece="" stop-opacity="0" stop-color="#1D1C1C" offset="0.02" />
											<stop id="stop574" data-v-0fa15ece="" stop-opacity="0.66" stop-color="#1D1C1C" offset="0.39" />
											<stop id="stop576" data-v-0fa15ece="" stop-color="#1D1C1C" offset="0.68" />
										</linearGradient>
										<linearGradient
											data-v-0fa15ece=""
											gradientUnits="userSpaceOnUse"
											y2="4.5342999"
											x2="79.754501"
											y1="23.017799"
											x1="61.270401"
											id="paint1_linear_2020_2049-header"
										>
											<stop id="stop579" data-v-0fa15ece="" stop-opacity="0" stop-color="#1D1C1C" offset="0.02" />
											<stop id="stop581" data-v-0fa15ece="" stop-opacity="0.66" stop-color="#1D1C1C" offset="0.39" />
											<stop id="stop583" data-v-0fa15ece="" stop-color="#1D1C1C" offset="0.68" />
										</linearGradient>
									</defs>
									<path
										id="path558"
										d="m 156.82031,0.03906 c -13.321,0 -21.03711,9.76847 -21.03711,20.48047 h 0.002 c 0,10.7121 7.65915,20.48047 21.03515,20.48047 13.376,0 21.08985,-9.76837 21.08985,-20.48047 0,-10.712 -7.76885,-20.48047 -21.08985,-20.48047 z M 0,1.05273 13.958984,39.83203 h 10.027344 l 6.480469,-21.10742 6.427734,21.10742 H 46.976562 L 60.9375,1.05273 H 48.75 L 41.824219,24.20898 35.066406,1.05273 H 25.871094 L 19.056641,24.20898 12.1875,1.05273 Z m 101.44922,0.0391 v 38.85351 h 11.54492 V 30.0098 h 2.16602 l 6.60351,9.93554 h 13.59766 L 127.5918,28.12308 c 4.441,-2.4982 7.10351,-7.27093 7.10351,-12.54493 0,-7.82522 -5.71765,-14.48632 -14.59765,-14.48632 z m 11.54492,8.99414 h 4.83008 c 3.109,0 5.10742,2.49829 5.10742,5.49609 0,2.9978 -2.05411,5.49414 -5.16211,5.49414 v -0.002 h -4.77539 z m 43.82617,0.49804 c 5.937,0 9.37891,4.77275 9.37891,9.93555 0,5.1606 -3.49691,9.93555 -9.37891,9.93555 -5.882,0 -9.38086,-4.77495 -9.38086,-9.93555 0,-5.1605 3.44286,-9.93555 9.38086,-9.93555 z"
										fill="currentColor"
									/>
									<path
										id="path564"
										data-v-0fa15ece=""
										d="m 78.4051,30.3574 c 0,0 -0.0185,0 -0.0278,0 -4.3184,0 -7.3462,-2.5769 -8.6461,-5.9887 H 99.0698 C 99.3057,23.0849 99.4283,21.7711 99.4283,20.441 99.4283,9.75673 91.7375,0.01388 78.4051,0 v 10.527 c 4.3439,0.0116 7.3416,2.5837 8.6276,5.9887 h -29.297 c -0.2336,1.2837 -0.3539,2.5976 -0.3539,3.9276 0,10.6913 7.7002,20.4434 20.9955,20.4434 0.0093,0 0.0185,0 0.0278,0 v -10.527 z"
										fill="currentColor"
									/>
									<path
										id="path566"
										data-v-0fa15ece=""
										d="m 78.3774,40.8844 c 0.451,0 0.8951,-0.0139 1.3346,-0.0347 2.7017,-0.1365 5.1535,-0.6801 7.3393,-1.5567 2.1858,-0.8767 4.1057,-2.0818 5.7387,-3.5391 1.633,-1.4573 2.9815,-3.1643 4.027,-5.0449 0.9506,-1.7094 1.6445,-3.5599 2.0794,-5.4913 H 86.672 c -0.2498,0.5158 -0.5413,1.0085 -0.8744,1.4688 -0.4556,0.6291 -0.9899,1.2005 -1.596,1.6932 -0.606,0.4927 -1.286,0.909 -2.0354,1.2306 -0.7495,0.3215 -1.566,0.5482 -2.4495,0.6615 -0.4303,0.0555 -0.8744,0.0879 -1.3347,0.0879 -2.7502,0 -4.9776,-1.0478 -6.5667,-2.6878 l -7.9476,7.9478 c 3.5366,3.2292 8.4426,5.2647 14.5166,5.2647 z"
										fill="currentColor"
									/>
									<path
										id="path568"
										data-v-0fa15ece=""
										d="M 78.3777,0 C 67.1016,0 59.8502,7.01337 57.9072,15.6691 H 70.097 c 1.4572,-2.9817 4.3277,-5.1421 8.2807,-5.1421 3.1503,0 5.5952,1.3462 7.1935,3.3818 L 93.5905,5.8892 C 90.0076,2.30155 84.8565,0.00231 78.3753,0.00231 Z"
										fill="currentColor"
									/>
								</svg>
							</DonateButton>
							{/* <DonateButton href="https://qr.alipay.com/fkx175153zjoblrjcwh4ode" style={{ backgroundColor: "#f7931a" }}>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
									<path fill="currentColor" d="M8 256a248 248 0 1 1 496 0 248 248 0 1 1 -496 0zm354.3-35.3c4.9-33-20.2-50.7-54.6-62.6l11.1-44.7-27.2-6.8-10.9 43.5c-7.2-1.8-14.5-3.5-21.8-5.1l10.9-43.8-27.2-6.8-11.2 44.7c-5.9-1.3-11.7-2.7-17.4-4.1l0-.1-37.5-9.4-7.2 29.1s20.2 4.6 19.8 4.9c11 2.8 13 10 12.7 15.8l-12.7 50.9c.8 .2 1.7 .5 2.8 .9-.9-.2-1.9-.5-2.9-.7l-17.8 71.3c-1.3 3.3-4.8 8.4-12.5 6.5 .3 .4-19.8-4.9-19.8-4.9l-13.5 31.1 35.4 8.8c6.6 1.7 13 3.4 19.4 5l-11.3 45.2 27.2 6.8 11.2-44.7c7.2 2 14.4 3.8 21.7 5.6l-11.1 44.5 27.2 6.8 11.3-45.1c46.4 8.8 81.3 5.2 96-36.7 11.8-33.8-.6-53.3-25-66 17.8-4.1 31.2-15.8 34.7-39.9zm-62.2 87.2c-8.4 33.8-65.3 15.5-83.8 10.9l14.9-59.9c18.4 4.6 77.6 13.7 68.8 49zm8.4-87.7c-7.7 30.7-55 15.1-70.4 11.3l13.5-54.3c15.4 3.8 64.8 11 56.8 43z" />
								</svg>
								Crypto
							</DonateButton> */}
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export default App;
