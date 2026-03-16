import type { VirtualItem } from '@tanstack/react-virtual';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef } from 'react';

const DEFAULT_OVERSCAN = 25;
const END_REACHED_THRESHOLD = 5;

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
	} = options;

	const scrollRef = useRef<HTMLElement | null>(null);
	const endReachedSentRef = useRef(false);

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
	};
}
