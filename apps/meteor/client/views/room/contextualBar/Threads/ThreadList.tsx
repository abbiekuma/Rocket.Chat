import type { IMessage, IThreadMainMessage } from '@rocket.chat/core-typings';
import { Box, Icon, TextInput, Select, Callout, Throbber } from '@rocket.chat/fuselage';
import { useResizeObserver, useAutoFocus, useLocalStorage, useDebouncedValue } from '@rocket.chat/fuselage-hooks';
import {
	VirtualizedScrollbars,
	ContextualbarClose,
	ContextualbarContent,
	ContextualbarHeader,
	ContextualbarIcon,
	ContextualbarTitle,
	ContextualbarEmptyContent,
	ContextualbarSection,
	ContextualbarDialog,
} from '@rocket.chat/ui-client';
import { useTranslation, useUserId, useRoomToolbox } from '@rocket.chat/ui-contexts';
import type { FormEvent } from 'react';
import { useMemo, useState, useCallback, memo } from 'react';

import { useAppVirtualizer } from '../../../../hooks/useAppVirtualizer';
import ThreadListItem from './components/ThreadListItem';
import { useThreadsList } from './hooks/useThreadsList';
import { getErrorMessage } from '../../../../lib/errorHandling';
import { useRoom, useRoomSubscription } from '../../contexts/RoomContext';
import { useGoToThread } from '../../hooks/useGoToThread';

type ThreadType = 'all' | 'following' | 'unread';

const THREAD_LIST_ITEM_ESTIMATE_SIZE = 84;

type ThreadListVirtualizedContentProps = {
	scrollerRef?: (element: HTMLElement | null) => void;
	items: IThreadMainMessage[];
	itemCount: number;
	inlineSize: number;
	blockSize: number;
	fetchNextPage: () => void;
	hasNextPage: boolean;
	subscription?: ReturnType<typeof useRoomSubscription>;
	onThreadClick: (tmid: IMessage['_id']) => void;
	resetKey?: unknown;
};

const ThreadListVirtualizedContent = memo(function ThreadListVirtualizedContent({
	scrollerRef,
	items,
	itemCount,
	inlineSize,
	blockSize,
	fetchNextPage,
	hasNextPage,
	subscription,
	onThreadClick,
	resetKey,
}: ThreadListVirtualizedContentProps) {
	const { virtualItems, totalSize, scrollContainerRef, measureElement } = useAppVirtualizer<IThreadMainMessage>({
		width: inlineSize,
		height: blockSize,
		count: items.length,
		totalCount: itemCount,
		onEndReached: fetchNextPage,
		hasNextPage,
		scrollerRef,
		estimateSize: THREAD_LIST_ITEM_ESTIMATE_SIZE,
		overscan: 25,
		items,
		measure: true,
		resetKey,
	});

	return (
		<Box
			ref={scrollContainerRef}
			style={{
				width: inlineSize,
				height: blockSize,
				overflow: 'auto',
			}}
			tabIndex={-1}
		>
			<Box style={{ height: totalSize, width: '100%', position: 'relative' }}>
				{virtualItems.map((virtualItem) => (
					<div
						key={virtualItem.key}
						ref={measureElement}
						data-index={virtualItem.index}
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							width: '100%',
							minHeight: THREAD_LIST_ITEM_ESTIMATE_SIZE,
							transform: `translateY(${virtualItem.start}px)`,
							willChange: 'transform',
						}}
					>
						{virtualItem.data && (
							<ThreadListItem
								thread={virtualItem.data}
								unread={subscription?.tunread ?? []}
								unreadUser={subscription?.tunreadUser ?? []}
								unreadGroup={subscription?.tunreadGroup ?? []}
								onClick={onThreadClick}
							/>
						)}
					</div>
				))}
			</Box>
		</Box>
	);
});

const ThreadList = () => {
	const t = useTranslation();

	const { closeTab } = useRoomToolbox();

	const handleTabBarCloseButtonClick = useCallback(() => {
		closeTab();
	}, [closeTab]);

	const { ref, contentBoxSize: { inlineSize = 378, blockSize = 1 } = {} } = useResizeObserver<HTMLElement>({
		debounceDelay: 200,
	});

	const autoFocusRef = useAutoFocus<HTMLInputElement>(true);

	const [searchText, setSearchText] = useState('');

	const handleSearchTextChange = useCallback(
		(event: FormEvent<HTMLInputElement>) => {
			setSearchText(event.currentTarget.value);
		},
		[setSearchText],
	);

	const typeOptions: (readonly [type: ThreadType, label: string])[] = useMemo(
		() => [
			['all', t('All')],
			['following', t('Following')],
			['unread', t('Unread')],
		],
		[t],
	);

	const [type, setType] = useLocalStorage<ThreadType>('thread-list-type', 'all');

	const handleTypeChange = useCallback(
		(type: string) => {
			const typeOption = typeOptions.find(([t]) => t === type);
			if (typeOption) setType(typeOption[0]);
		},
		[setType, typeOptions],
	);

	const room = useRoom();
	const rid = room._id;
	const subscription = useRoomSubscription();
	const subscribed = !!subscription;
	const uid = useUserId();
	const tunread = subscription?.tunread?.sort().join(',');
	const text = useDebouncedValue(searchText, 400);
	const options = useDebouncedValue(
		useMemo(() => {
			if (type === 'all' || !subscribed || !uid) {
				return {
					rid,
					text,
				};
			}
			switch (type) {
				case 'following':
					return {
						rid,
						text,
						type,
						uid,
					};
				case 'unread':
					return {
						rid,
						text,
						type,
						tunread: tunread?.split(','),
					};
			}
		}, [rid, subscribed, text, tunread, type, uid]),
		300,
	);

	const { isPending, error, isSuccess, data, fetchNextPage, hasNextPage } = useThreadsList(options);

	const items = data?.items || [];
	const itemCount = data?.itemCount ?? 0;

	const goToThread = useGoToThread({ replace: true });
	const handleThreadClick = useCallback(
		(tmid: IMessage['_id']) => {
			goToThread({ rid, tmid });
		},
		[rid, goToThread],
	);

	return (
		<ContextualbarDialog>
			<ContextualbarHeader>
				<ContextualbarIcon name='thread' />
				<ContextualbarTitle>{t('Threads')}</ContextualbarTitle>
				<ContextualbarClose onClick={handleTabBarCloseButtonClick} />
			</ContextualbarHeader>
			<ContextualbarSection>
				<TextInput
					placeholder={t('Search_Messages')}
					addon={<Icon name='magnifier' size='x20' />}
					ref={autoFocusRef}
					value={searchText}
					onChange={handleSearchTextChange}
				/>
				<Box w='x144' mis={8}>
					<Select options={typeOptions} value={type} onChange={(value) => handleTypeChange(String(value))} />
				</Box>
			</ContextualbarSection>
			<ContextualbarContent paddingInline={0}>
				{isPending && (
					<Box pi={24} pb={12}>
						<Throbber size='x12' />
					</Box>
				)}

				{error && (
					<Callout mi={24} type='danger'>
						{getErrorMessage(error, t('Something_went_wrong'))}
					</Callout>
				)}

				{isSuccess && itemCount === 0 && <ContextualbarEmptyContent title={t('No_Threads')} />}

				<Box flexGrow={1} flexShrink={1} overflow='hidden' display='flex' ref={ref}>
					{!error && itemCount > 0 && items.length > 0 && (
						<VirtualizedScrollbars>
							<ThreadListVirtualizedContent
								items={items}
								itemCount={itemCount}
								inlineSize={inlineSize}
								blockSize={blockSize}
								fetchNextPage={fetchNextPage}
								hasNextPage={hasNextPage ?? false}
								subscription={subscription}
								onThreadClick={handleThreadClick}
								resetKey={options}
							/>
						</VirtualizedScrollbars>
					)}
				</Box>
			</ContextualbarContent>
		</ContextualbarDialog>
	);
};

export default ThreadList;
