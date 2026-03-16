import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_OVERSCAN = 25;
const END_REACHED_THRESHOLD = 5;
/** When scroll position is within this many px of the bottom, also trigger onEndReached (fallback for spacer region). */
const END_REACHED_SCROLL_THRESHOLD = 100;

export type UseAppVirtualizerOptions<T = unknown> = {
	/** Width of the scroll container (e.g. from useResizeObserver contentBoxSize.inlineSize) */
	width: number;
	/** Height of the scroll container (e.g. from useResizeObserver contentBoxSize.blockSize) */
	height: number;
	/** Number of items currently loaded (e.g. items.length) */
	count: number;
	/** Total number of items from server (optional). When set, totalSize includes a spacer for unloaded items. */
	totalCount?: number;
	/** Callback when user scrolls near the end. Use with hasNextPage to avoid duplicate fetches. */
	onEndReached?: () => void;
	/** When false, onEndReached will not be called (e.g. no more pages). */
	hasNextPage?: boolean;
	/**
	 * Setter injected by VirtualizedScrollbars via cloneElement(children, { scrollerRef }).
	 * Pass it so the same DOM element is used for both OverlayScrollbars and the virtualizer.
	 */
	scrollerRef?: (element: HTMLElement | null) => void;
	/** Fixed row height in px, or a function (index) => height. */
	estimateSize: number | ((index: number) => number);
	/** Number of items to render outside the visible area. Default 25. */
	overscan?: number;
	/** Optional data array; when provided, each virtual item will have a .data property. */
	items?: T[];
	/**
	 * When true, enable dynamic row height: pass measureElement as ref to each row node and set data-index
	 * to the virtual item index. Do not set a fixed height on rows; use minHeight with estimateSize for initial layout.
	 */
	measure?: boolean;
};

export type AppVirtualItem<T = unknown> = VirtualItem & { data?: T };

export type UseAppVirtualizerResult<T = unknown> = {
	/** Virtual items to render; position each with transform: translateY(item.start). */
	virtualItems: AppVirtualItem<T>[];
	/** Total scrollable height; set this as the height of the inner content wrapper. */
	totalSize: number;
	/**
	 * Attach this ref to the scroll container (the div with overflow: auto).
	 * When used inside VirtualizedScrollbars, the parent receives scrollerRef and must pass it to this hook
	 * so the same element is used for scrollbars and virtualization.
	 */
	scrollContainerRef: (element: HTMLElement | null) => void;
	/** Scroll to a given index (e.g. for EmojiPicker category). */
	scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end'; behavior?: 'auto' | 'smooth' }) => void;
	/**
	 * When measure option is true, attach this ref to each row root element and set data-index={virtualItem.index}
	 * so the virtualizer can measure actual row height. Omit fixed height on the row; use minHeight for initial layout.
	 */
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

	const virtualItems = virtualizer.getVirtualItems();
	const baseTotalSize = virtualizer.getTotalSize();
	const sizePerItem = normalizeEstimateSize(estimateSize, 0);
	const spacerSize =
		totalCount != null && totalCount > count ? (totalCount - count) * sizePerItem : 0;
	const totalSize = baseTotalSize + spacerSize;

	totalSizeRef.current = totalSize;
	heightRef.current = height;
	onEndReachedRef.current = onEndReached;
	hasNextPageRef.current = hasNextPage;

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
