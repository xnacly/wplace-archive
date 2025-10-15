import { useLayoutEffect, useMemo, useRef } from "react";

export const useEvent = (fn) => {
	const ref = useRef(fn);
	useLayoutEffect(() => {
		ref.current = fn;
	});
	return useMemo(
		() =>
			(...args) => {
				const { current } = ref;
				return current(...args);
			},
		[]
	);
};
