import { useRef, useCallback, useLayoutEffect, useState, useEffect } from "react";
import "./Timeline.css";

interface TimelineProps {
	dates: Date[];
	selectedIndex: number;
	onSelect: (index: number) => void;
}

// Custom timeline using HTML range input, with steps equal to number of dates.
// Date labels are shown below, skipping those that would overlap to fit as many as possible without scrolling.
export default function Timeline({ dates, selectedIndex, onSelect }: TimelineProps) {
	const containerRef = useRef<HTMLInputElement | null>(null);
	const [labelData, setLabelData] = useState<{ index: number; left?: number; text: string; leftPercent?: number; alignment?: string }[]>(
		[],
	);
	const totalItems = dates.length;

	const formatLabel = useCallback((date: Date) => {
		if (!date || isNaN(date.getTime())) return "Now";
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "2-digit",
		});
	}, []);

	const computeLabels = useCallback(() => {
		const container = containerRef.current;
		if (!container || !totalItems) {
			setLabelData([]);
			return;
		}

		const sliderWidth = container.getBoundingClientRect().width;

		if (!sliderWidth) {
			setLabelData([]);
			return;
		}

		const approxLabelWidth = 48; // Tailwind w-12
		const maxLabelsBySpace = Math.max(1, Math.floor(sliderWidth / approxLabelWidth));
		const desiredCount = totalItems === 1 ? 1 : Math.max(2, maxLabelsBySpace);
		const visibleCount = Math.min(totalItems, desiredCount);

		if (visibleCount <= 0) {
			setLabelData([]);
			return;
		}

		if (visibleCount === 1) {
			const text = formatLabel(dates[0]);
			setLabelData([
				{
					index: 0,
					leftPercent: 50,
					text,
					alignment: "center",
				},
			]);
			return;
		}

		const lastIndex = totalItems - 1;
		const denominator = visibleCount - 1;
		const indices: number[] = [];
		let previous = -1;
		for (let slot = 0; slot < visibleCount; slot++) {
			const fraction = slot / denominator;
			let candidate = slot === visibleCount - 1 ? lastIndex : Math.round(fraction * lastIndex);
			candidate = Math.min(lastIndex, Math.max(previous + 1, candidate));
			indices.push(candidate);
			previous = candidate;
		}

		const halfWidth = approxLabelWidth / 2;
		const minLeft = Math.min(halfWidth, sliderWidth / 2);
		const maxLeft = Math.max(minLeft, sliderWidth - minLeft);

		const labels = indices.map((dataIndex, position) => {
			const fraction = position / denominator;
			let left = fraction * sliderWidth;
			left = Math.max(minLeft, Math.min(maxLeft, left));
			return {
				index: dataIndex,
				left,
				text: formatLabel(dates[dataIndex]),
			};
		});

		setLabelData(labels);
	}, [dates, formatLabel, totalItems]);

	useLayoutEffect(() => {
		computeLabels();
	}, [computeLabels]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const resizeObserver = new ResizeObserver(() => {
			computeLabels();
		});
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [computeLabels]);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const idx = parseInt(e.target.value, 10);
			onSelect(idx);
		},
		[onSelect],
	);

	if (!totalItems) return null;

	return (
		<div className="pointer-events-auto select-none text-neutral-100 bg-neutral-800/40 rounded px-8 pt-1 pb-1" aria-label="Timeline">
			<div className="relative h-10">
				{/* Styled range input */}
				<input
					type="range"
					ref={containerRef}
					min={0}
					max={totalItems - 1}
					step={1}
					value={selectedIndex}
					onChange={handleChange}
					className="absolute inset-0 w-full h-6 appearance-none bg-transparent cursor-pointer timeline-slider border-1"
					style={{
						WebkitAppearance: "none",
						background: "transparent",
					}}
					role="slider"
					tabIndex={0}
					aria-valuemin={0}
					aria-valuemax={totalItems - 1}
					aria-valuenow={selectedIndex}
					aria-label="Time slider"
				/>
				{/* Date labels */}
				<div className="absolute top-6 left-0 right-0">
					{labelData.map(({ index, left, text, leftPercent, alignment }) => (
						<div
							key={index}
							className="absolute text-[10px] text-neutral-300 whitespace-nowrap border-1"
							style={{
								left: leftPercent ? `${left}%` : `${left}px`,
								transform: "translateX(-50%)",
								width: 46,
								textAlign: alignment === "center" ? "center" : undefined,
							}}
						>
							{text}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
