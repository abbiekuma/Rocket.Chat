import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_OVERSCAN = 25;
const END_REACHED_THRESHOLD = 5;
const END_REACHED_SCROLL_THRESHOLD = 100;

export type UseAppVirtualizerOptions<T = unknown> = {
	width: number;
	height: number;
	count: number;
	totalCount?: number;
	onEndReached?: () => void;
	hasNextPage?: boolean;
	scrollerRef?: (element: HTMLElement | null) => void;
	estimateSize: number | ((index: number) => number);
	overscan?: number;
	items?: T[];
	measure?: boolean;
	resetKey?: unknown;
};

export type AppVirtualItem<T = unknown> = VirtualItem & { data?: T };

export type UseAppVirtualizerResult<T = unknown> = {
	virtualItems: AppVirtualItem<T>[];
	totalSize: number;
	scrollContainerRef: (element: HTMLElement | null) => void;
	scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }) => void;
	measureElement?: (element: HTMLElement | null) => void;
};

function normalizeEstimateSize(estimateSize: number | ((index: number) => number), index: number): number {
	return typeof estimateSize === 'number' ? estimateSize : estimateSize(index);
}

export function useAppVirtualizer<T = unknown>(options: UseAppVirtualizerOptions<T>): UseAppVirtualizerResult<T> {
	const {
		width,
		height,
		count,
		totalCount,
		onEndReached,
		hasNextPage = true,
		scrollerRef,
		estimateSize,
		overscan = DEFAULT_OVERSCAN,
		items,
		measure = false,
		resetKey,
	} = options;

	const scrollRef = useRef<HTMLElement | null>(null);
	const endReachedSentRef = useRef(false);
	const prevCountRef = useRef(count);
	const totalSizeRef = useRef(0);
	const heightRef = useRef(0);
	const onEndReachedRef = useRef(onEndReached);
	const hasNextPageRef = useRef(hasNextPage);

	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index: number) => normalizeEstimateSize(estimateSize, index),
		overscan,
		enabled: width > 0 && height > 0,
	});

	const scrollContainerRef = useCallback(
		(element: HTMLElement | null) => {
			scrollRef.current = element;
			scrollerRef?.(element);
		},
		[scrollerRef],
	);

	// visible items + the number of pre-loaded items
	const virtualItems = virtualizer.getVirtualItems();
	const baseTotalSize = virtualizer.getTotalSize();
	const sizePerItem =
		virtualItems.length > 0
			? virtualItems.reduce((sum, item) => sum + item.size, 0) / virtualItems.length
			: normalizeEstimateSize(estimateSize, 0);
	const spacerSize = totalCount != null && totalCount > count ? (totalCount - count) * sizePerItem : 0;
	const totalSize = baseTotalSize + spacerSize;

	totalSizeRef.current = totalSize;
	heightRef.current = height;
	onEndReachedRef.current = onEndReached;
	hasNextPageRef.current = hasNextPage;

	// Reset scroll position and end-reached gate when the data source changes
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = 0;
		}
		endReachedSentRef.current = false;
	}, [resetKey]);

	// Reset endReachedSentRef when more items were loaded so we can trigger the next page
	useEffect(() => {
		if (count > prevCountRef.current) {
			endReachedSentRef.current = false;
		}
		prevCountRef.current = count;
	}, [count]);

	// Trigger onEndReached when last visible item index is near the end (existing logic)
	useEffect(() => {
		if (!onEndReached || count === 0 || virtualItems.length === 0) {
			return;
		}
		const lastItem = virtualItems[virtualItems.length - 1];
		const lastIndex = lastItem?.index ?? -1;
		const threshold = count - END_REACHED_THRESHOLD;

		if (lastIndex < threshold - 1) {
			endReachedSentRef.current = false;
			return;
		}
		if (lastIndex >= threshold && hasNextPage && !endReachedSentRef.current) {
			endReachedSentRef.current = true;
			onEndReached();
		}
	}, [count, hasNextPage, onEndReached, virtualItems]);

	// Fallback: trigger onEndReached when scroll position is near the bottom (e.g. user scrolled into spacer)
	useEffect(() => {
		const el = scrollRef.current;
		if (!el || !onEndReachedRef.current) {
			return;
		}
		const handler = (): void => {
			const scrollTop = el.scrollTop;
			const total = totalSizeRef.current;
			const h = heightRef.current;
			if (total <= 0 || h <= 0) return;
			const nearBottom = scrollTop + h >= total - END_REACHED_SCROLL_THRESHOLD;
			if (!nearBottom) {
				endReachedSentRef.current = false;
				return;
			}
			if (hasNextPageRef.current && !endReachedSentRef.current) {
				endReachedSentRef.current = true;
				onEndReachedRef.current?.();
			}
		};
		el.addEventListener('scroll', handler, { passive: true });
		return () => el.removeEventListener('scroll', handler);
	}, [count, totalSize, height]);

	const scrollToIndex = useCallback(
		(index: number, scrollOptions?: { align?: 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }) => {
			virtualizer.scrollToIndex(index, scrollOptions);
		},
		[virtualizer],
	);

	const resultItems: AppVirtualItem<T>[] = items
		? virtualItems.map((item: VirtualItem) => ({ ...item, data: items[item.index] }))
		: (virtualItems as AppVirtualItem<T>[]);

	return {
		virtualItems: resultItems,
		totalSize,
		scrollContainerRef,
		scrollToIndex,
		...(measure && { measureElement: virtualizer.measureElement }),
	};
}
