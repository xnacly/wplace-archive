import { useMemo, useRef, useCallback } from "react";

interface DayGroup {
	key: string; // YYYY-MM-DD
	date: Date;
	items: { date: Date; index: number }[];
}

interface TimelineProps {
	dayGroups: DayGroup[];
	selectedIndex: number;
	onSelect: (index: number) => void;
}

// Custom timeline where each day occupies equal horizontal space regardless of
// number of timestamps. Ticks inside a day are distributed evenly.
export default function Timeline({ dayGroups, selectedIndex, onSelect }: TimelineProps) {
	const totalItems = useMemo(() => dayGroups.reduce((s, g) => s + g.items.length, 0), [dayGroups]);
	const trackRef = useRef<HTMLDivElement | null>(null);

	const dayCount = dayGroups.length;

	// Build a quick lookup for (global index -> {dayIdx, withinIdx, withinCount})
	const indexMeta = useMemo(() => {
		const m: Record<number, { dayIdx: number; withinIdx: number; withinCount: number }> = {};
		dayGroups.forEach((dg, di) => {
			dg.items.forEach((it, wi) => {
				m[it.index] = { dayIdx: di, withinIdx: wi, withinCount: dg.items.length };
			});
		});
		return m;
	}, [dayGroups]);

	const calcIndexFromPointer = useCallback(
		(clientX: number) => {
			const el = trackRef.current;
			if (!el) return selectedIndex;
			const r = el.getBoundingClientRect();
			const pct = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
			const dayFloat = pct * dayCount;
			const dayIdx = Math.min(dayCount - 1, Math.max(0, Math.floor(dayFloat)));
			const dayStartPct = dayIdx / dayCount;
			const insideDayPct = (pct - dayStartPct) * dayCount; // 0..1 inside day segment
			const group = dayGroups[dayIdx];
			const len = group.items.length;
			if (len === 1) return group.items[0].index;
			const withinIdx = Math.round(insideDayPct * (len - 1));
			return group.items[withinIdx].index;
		},
		[dayCount, dayGroups, selectedIndex]
	);

	const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
		const idx = calcIndexFromPointer(e.clientX);
		onSelect(idx);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};
	const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
		if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
		const idx = calcIndexFromPointer(e.clientX);
		if (idx !== selectedIndex) onSelect(idx);
	};

	const onKey = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowLeft") {
			onSelect(Math.max(0, selectedIndex - 1));
			e.preventDefault();
		} else if (e.key === "ArrowRight") {
			onSelect(Math.min(totalItems - 1, selectedIndex + 1));
			e.preventDefault();
		}
	};

	// Compute thumb visual position (non-linear). We place the thumb at the tick location.
	const thumbStyle = (() => {
		const meta = indexMeta[selectedIndex];
		if (!meta) return { left: "0%" };
		const dayWidth = 100 / dayCount;
		const withinPos = meta.withinCount === 1 ? 0.5 : meta.withinIdx / (meta.withinCount - 1);
		const leftPct = meta.dayIdx * dayWidth + withinPos * dayWidth;
		return { left: `${leftPct}%` };
	})();

	if (!dayCount) return null;

	return (
		<div className="pointer-events-auto select-none text-neutral-100 bg-neutral-800/40 rounded px-4 pt-1 pb-1" aria-label="Timeline">
			<div
				ref={trackRef}
				className="relative h-10"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				role="slider"
				tabIndex={0}
				aria-valuemin={0}
				aria-valuemax={totalItems - 1}
				aria-valuenow={selectedIndex}
				aria-label="Time slider"
				onKeyDown={onKey}
			>
				{/* Day segments */}
				<div className="absolute inset-x-0 top-1 h-4 flex gap-px">
					{dayGroups.map((g, di) => (
						<div key={g.key} className="relative flex-1 bg-neutral-700/30">
							{g.items.map((it, wi) => {
								const len = g.items.length;
								const pos = len === 1 ? 0.5 : wi / (len - 1);
								return (
									<div
										key={it.index}
										title={it.date.toLocaleString(navigator.language)}
										onClick={(e) => {
											e.stopPropagation();
											onSelect(it.index);
										}}
										className={`absolute -translate-x-1/2 cursor-pointer rounded ${it.index === selectedIndex ? "h-4 w-1 bg-indigo-400" : "h-3 w-px bg-neutral-400/60 hover:bg-neutral-200"}`}
										style={{ left: `${pos * 100}%`, top: it.index === selectedIndex ? 0 : 2 }}
									/>
								);
							})}
							{/* Day label */}
							<div className="absolute left-1/2 top-5 -translate-x-1/2 whitespace-nowrap text-[10px] text-neutral-300">
								{g.key}
							</div>
						</div>
					))}
				</div>
				{/* Thumb */}
				<div
					className="absolute top-0 h-6 w-3 -translate-x-1/2 cursor-grab rounded-full border border-indigo-300/50 bg-indigo-400/80 shadow ring-2 ring-indigo-300/30"
					style={thumbStyle}
					aria-hidden
				/>
			</div>
		</div>
	);
}
