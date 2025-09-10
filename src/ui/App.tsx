import { useLayoutEffect, useState, useRef, useCallback, useMemo, useEffect } from "react";
import Timeline from "./Timeline";
import { ColorSpecification, LayerSpecification, Map } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";
import layers from "./mapstyle.json";

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
	"2025-09-09T11:58:48.527Z",
	"2025-08-25T21:47:23.259Z",
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
	const [selectedIndex, setSelectedIndex] = useState(0);
	const mapRef = useRef<Map | null>(null);
	const mapReadyRef = useRef(false);
	const [forceUpdate, setForceUpdate] = useState(0);

	const [times, setTimes] = useState<Date[]>(defaultTimes);
	const [pendingHashTime, setPendingHashTime] = useState<string | null>(null);

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
			: `/tiles/world-${currentSlug}/{z}/{x}/{y}.png`;

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
				month: "long",
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
			<div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-neutral-900/70 px-3 py-1 text-xs font-medium text-neutral-100 shadow-md backdrop-blur">
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
			{/* Timeline overlay */}
			<div className="absolute left-0 right-0 bottom-0 z-10 bg-gradient-to-t from-neutral-900/80 to-neutral-900/40">
				<Timeline dayGroups={dayGroups} selectedIndex={selectedIndex} onSelect={onSelect} />
			</div>
		</>
	);
}

export default App;
