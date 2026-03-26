import { render, screen, act } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';

import { useAppVirtualizer } from './useAppVirtualizer';

const ITEMS = Array.from({ length: 5 }, (_, i) => `item-${i}`);

const TestComponent = ({
	width = 400,
	height = 300,
	count = ITEMS.length,
	totalCount = ITEMS.length,
	onEndReached,
	hasNextPage = true,
	measure = false,
	resetKey,
}: {
	width?: number;
	height?: number;
	count?: number;
	totalCount?: number;
	onEndReached?: () => void;
	hasNextPage?: boolean;
	measure?: boolean;
	resetKey?: unknown;
}): ReactElement => {
	const scrollRef = useRef<HTMLDivElement | null>(null);

	const { virtualItems, totalSize, scrollContainerRef, measureElement } = useAppVirtualizer<string>({
		width,
		height,
		count,
		totalCount,
		onEndReached,
		hasNextPage,
		scrollerRef: (el) => {
			// ensure scrollerRef can be called without issues
			void el;
		},
		estimateSize: 50,
		overscan: 0,
		items: ITEMS.slice(0, count),
		measure,
		resetKey,
	});

	return (
		<div
			ref={(el) => {
				scrollRef.current = el;
				if (el) {
					// jsdom has no layout; virtualizer reads offsetWidth/offsetHeight and gets 0, so no rows render.
					// Mock dimensions so the virtualizer produces virtual items.
					Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
					Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
				}
				scrollContainerRef(el);
			}}
			data-testid='scroll-container'
			style={{ width, height, overflow: 'auto' }}
		>
			<div data-testid='inner' style={{ height: totalSize }}>
				{virtualItems.map((item) => (
					<div
						key={item.key}
						data-testid='row'
						data-index={item.index}
						ref={measure ? measureElement : undefined}
						style={{ transform: `translateY(${item.start}px)` }}
					>
						{item.data}
					</div>
				))}
			</div>
		</div>
	);
};

describe('useAppVirtualizer', () => {
	it('maps items to virtualItems with data', async () => {
		render(<TestComponent />);

		const rows = await screen.findAllByTestId('row');
		expect(rows).toHaveLength(ITEMS.length);
		expect(rows[0]).toHaveTextContent('item-0');
		expect(rows[rows.length - 1]).toHaveTextContent(`item-${ITEMS.length - 1}`);
	});

	it('exposes measureElement when measure is true', async () => {
		render(<TestComponent measure />);

		const rows = await screen.findAllByTestId('row');
		expect(rows.length).toBeGreaterThan(0);
		const dataIndex = rows[0].getAttribute('data-index');
		expect(dataIndex).not.toBeNull();
		const index = Number.parseInt(dataIndex ?? '', 10);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(ITEMS.length);
	});

	it('adds spacer when totalCount is greater than count', () => {
		render(<TestComponent count={2} totalCount={4} />);

		const inner = screen.getByTestId('inner');
		const height = Number.parseFloat(inner.style.height || '0');
		expect(height).toBeGreaterThanOrEqual(200);
	});

	it('calls onEndReached when scrolling near the bottom and hasNextPage is true', () => {
		const onEndReached = jest.fn();

		render(<TestComponent onEndReached={onEndReached} totalCount={20} />);

		const container = screen.getByTestId('scroll-container');

		act(() => {
			Object.defineProperty(container, 'scrollTop', {
				value: 1000,
				writable: true,
			});
			container.dispatchEvent(new Event('scroll'));
		});

		expect(onEndReached).toHaveBeenCalled();
	});

	it('resets scrollTop to 0 when resetKey changes', () => {
		const { rerender } = render(<TestComponent resetKey='key-1' />);

		const container = screen.getByTestId('scroll-container');

		act(() => {
			Object.defineProperty(container, 'scrollTop', { value: 300, writable: true, configurable: true });
		});
		expect(container.scrollTop).toBe(300);

		act(() => {
			rerender(<TestComponent resetKey='key-2' />);
		});

		expect(container.scrollTop).toBe(0);
	});

	it('allows onEndReached to fire again after resetKey changes', () => {
		const onEndReached = jest.fn();

		const { rerender } = render(<TestComponent onEndReached={onEndReached} count={20} totalCount={20} resetKey='key-1' />);

		const container = screen.getByTestId('scroll-container');

		act(() => {
			Object.defineProperty(container, 'scrollTop', { value: 1000, writable: true, configurable: true });
			container.dispatchEvent(new Event('scroll'));
		});
		expect(onEndReached).toHaveBeenCalledTimes(1);
		onEndReached.mockClear();

		act(() => {
			container.dispatchEvent(new Event('scroll'));
		});
		expect(onEndReached).not.toHaveBeenCalled();
		act(() => {
			rerender(<TestComponent onEndReached={onEndReached} count={20} totalCount={20} resetKey='key-2' />);
		});

		act(() => {
			Object.defineProperty(container, 'scrollTop', { value: 1000, writable: true, configurable: true });
			container.dispatchEvent(new Event('scroll'));
		});
		expect(onEndReached).toHaveBeenCalledTimes(1);
	});
});
