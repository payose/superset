/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import {
  CSSProperties,
  cloneElement,
  forwardRef,
  ReactElement,
  RefObject,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
  useRef,
  ReactNode,
} from 'react';

import { Global } from '@emotion/react';
import { css, t, useTheme, usePrevious } from '@superset-ui/core';
import { useResizeDetector } from 'react-resize-detector';
import Badge from '../Badge';
import { Icons } from '../Icons';
import Button from '../Button';
import Popover from '../Popover';
import { Tooltip } from '../Tooltip';

const MAX_HEIGHT = 500;

/**
 * Container item.
 */
export interface Item {
  /**
   * String that uniquely identifies the item.
   */
  id: string;
  /**
   * The element to be rendered.
   */
  element: ReactElement;
}

/**
 * Horizontal container that displays overflowed items in a dropdown.
 * It shows an indicator of how many items are currently overflowing.
 */
export interface DropdownContainerProps {
  /**
   * Array of items. The id property is used to uniquely identify
   * the elements when rendering or dealing with event handlers.
   */
  items: Item[];
  /**
   * Event handler called every time an element moves between
   * main container and dropdown.
   */
  onOverflowingStateChange?: (overflowingState: {
    notOverflowed: string[];
    overflowed: string[];
  }) => void;
  /**
   * Option to customize the content of the dropdown.
   */
  dropdownContent?: (overflowedItems: Item[]) => ReactElement;
  /**
   * Dropdown ref.
   */
  dropdownRef?: RefObject<HTMLDivElement>;
  /**
   * Dropdown additional style properties.
   */
  dropdownStyle?: CSSProperties;
  /**
   * Displayed count in the dropdown trigger.
   */
  dropdownTriggerCount?: number;
  /**
   * Icon of the dropdown trigger.
   */
  dropdownTriggerIcon?: ReactElement;
  /**
   * Text of the dropdown trigger.
   */
  dropdownTriggerText?: string;
  /**
   * Text of the dropdown trigger tooltip
   */
  dropdownTriggerTooltip?: ReactNode | null;
  /**
   * Main container additional style properties.
   */
  style?: CSSProperties;
  /**
   * Force render popover content before it's first opened
   */
  forceRender?: boolean;
}

export type Ref = HTMLDivElement & { open: () => void };

const DropdownContainer = forwardRef(
  (
    {
      items,
      onOverflowingStateChange,
      dropdownContent,
      dropdownRef,
      dropdownStyle = {},
      dropdownTriggerCount,
      dropdownTriggerIcon,
      dropdownTriggerText = t('More'),
      dropdownTriggerTooltip = null,
      forceRender,
      style,
    }: DropdownContainerProps,
    outerRef: RefObject<Ref>,
  ) => {
    const theme = useTheme();
    const { ref, width = 0 } = useResizeDetector<HTMLDivElement>();
    const previousWidth = usePrevious(width) || 0;
    const { current } = ref;
    const [itemsWidth, setItemsWidth] = useState<number[]>([]);
    const [popoverVisible, setPopoverVisible] = useState(false);
    const [overflowingIndex, setOverflowingIndex] = useState<number>(-1);

    let targetRef = useRef<HTMLDivElement>(null);
    if (dropdownRef) {
      targetRef = dropdownRef;
    }

    const [showOverflow, setShowOverflow] = useState(false);

    const reduceItems = (itemsToReduce: Item[]): [Item[], string[]] =>
      itemsToReduce.reduce(
        ([reducedItems, ids], item) => {
          reducedItems.push({
            id: item.id,
            element: cloneElement(item.element, { key: item.id }),
          });
          ids.push(item.id);
          return [reducedItems, ids];
        },
        [[], []] as [Item[], string[]],
      );

    const [notOverflowedItems, notOverflowedIds] = useMemo(
      () =>
        reduceItems(
          items.slice(
            0,
            overflowingIndex !== -1 ? overflowingIndex : items.length,
          ),
        ),
      [items, overflowingIndex],
    );

    const [overflowedItems, overflowedIds] = useMemo(
      () =>
        overflowingIndex !== -1
          ? reduceItems(items.slice(overflowingIndex))
          : [[], []],
      [items, overflowingIndex],
    );

    const recalculateItemWidths = useMemo(
      () => () => {
        const container = current?.children.item(0);
        if (container) {
          const { children } = container;
          const childrenArray = Array.from(children);
          const newMeasuredWidths = childrenArray.map(
            child => child.getBoundingClientRect().width,
          );
          setItemsWidth(prevItemsWidth => {
            const updatedWidths = new Array(items.length).fill(0);
            if (prevItemsWidth && prevItemsWidth.length === items.length) {
              for (let i = 0; i < items.length; i += 1) {
                updatedWidths[i] = prevItemsWidth[i];
              }
            }
            newMeasuredWidths.forEach((itemWidth, idx) => {
              if (idx < updatedWidths.length) {
                updatedWidths[idx] = itemWidth;
              }
            });
            return updatedWidths;
          });
        }
      },
      [current, items.length],
    );

    useEffect(() => {
      const container = current?.children.item(0);
      if (!container) return undefined;

      const childrenArray = Array.from(container.children);
      const resizeObserver = new ResizeObserver(recalculateItemWidths);
      resizeObserver.observe(container);
      childrenArray.forEach(child => resizeObserver.observe(child));

      return () => {
        childrenArray.forEach(child => resizeObserver.unobserve(child));
        resizeObserver.disconnect();
        resizeObserver.unobserve(container);
      };
    }, [items.length, recalculateItemWidths, notOverflowedItems.length]);

    useLayoutEffect(() => {
      if (popoverVisible) {
        return;
      }
      const itemContainerNode = current?.children.item(0);
      if (itemContainerNode) {
        const visibleChildrenElements = Array.from(itemContainerNode.children);

        if (itemsWidth.length !== items.length) {
          if (visibleChildrenElements.length === items.length) {
            setItemsWidth(
              visibleChildrenElements.map(
                child => child.getBoundingClientRect().width,
              ),
            );
          } else {
            setOverflowingIndex(-1);
            return;
          }
        }

        const itemContainerRightBoundary =
          itemContainerNode.getBoundingClientRect().right + 1;
        const firstOverflowingChildIndex = visibleChildrenElements.findIndex(
          child =>
            child.getBoundingClientRect().right > itemContainerRightBoundary,
        );

        let newOverflowingIndex = firstOverflowingChildIndex;

        if (firstOverflowingChildIndex === -1 && overflowedItems.length > 0) {
          newOverflowingIndex = items.length - overflowedItems.length;
        }

        if (
          width > previousWidth &&
          newOverflowingIndex !== -1 &&
          newOverflowingIndex < items.length
        ) {
          const currentItemContainerWidth =
            itemContainerNode.getBoundingClientRect().width;

          let widthUsedByVisibleItems = 0;
          const numVisibleItems =
            newOverflowingIndex === -1 ? items.length : newOverflowingIndex;

          if (numVisibleItems > 0) {
            for (let i = 0; i < numVisibleItems; i += 1) {
              widthUsedByVisibleItems += itemsWidth[i] || 0;
            }
            widthUsedByVisibleItems +=
              (numVisibleItems - 1) * (theme.gridUnit * 4);
          }

          const availableSpaceForMore =
            currentItemContainerWidth - widthUsedByVisibleItems;
          let accumulatedWidthOfItemsToAdd = 0;
          let itemsCanBeAdded = 0;

          for (let i = numVisibleItems; i < items.length; i += 1) {
            const itemToAddWidth = itemsWidth[i] || 0;
            if (itemToAddWidth === 0) break;

            const gap = theme.gridUnit * 4;
            if (
              accumulatedWidthOfItemsToAdd + itemToAddWidth + gap <=
              availableSpaceForMore
            ) {
              accumulatedWidthOfItemsToAdd += itemToAddWidth + gap;
              itemsCanBeAdded += 1;
            } else {
              break;
            }
          }
          if (itemsCanBeAdded > 0) {
            newOverflowingIndex = numVisibleItems + itemsCanBeAdded;
          }
        }
        setOverflowingIndex(newOverflowingIndex);
      }
    }, [
      current,
      items.length,
      itemsWidth,
      overflowedItems.length,
      previousWidth,
      width,
      popoverVisible,
      theme.gridUnit,
    ]);

    useEffect(() => {
      if (onOverflowingStateChange) {
        onOverflowingStateChange({
          notOverflowed: notOverflowedIds,
          overflowed: overflowedIds,
        });
      }
    }, [notOverflowedIds, onOverflowingStateChange, overflowedIds]);

    const overflowingCount =
      overflowingIndex !== -1 ? items.length - overflowingIndex : 0;

    const popoverContent = useMemo(
      () =>
        dropdownContent || overflowingCount ? (
          <div
            css={css`
              display: flex;
              flex-direction: column;
              gap: ${theme.gridUnit * 4}px;
            `}
            data-test="dropdown-content"
            style={dropdownStyle}
            ref={targetRef}
          >
            {dropdownContent
              ? dropdownContent(overflowedItems)
              : overflowedItems.map(item => item.element)}
          </div>
        ) : null,
      [
        dropdownContent,
        overflowingCount,
        theme.gridUnit,
        dropdownStyle,
        overflowedItems,
      ],
    );

    useLayoutEffect(() => {
      if (popoverVisible) {
        setTimeout(() => {
          if (targetRef.current) {
            setShowOverflow(targetRef.current.scrollHeight > MAX_HEIGHT);
          }
        }, 100);
      }
    }, [popoverVisible]);

    useImperativeHandle(
      outerRef,
      () => ({
        ...(ref.current as HTMLDivElement),
        open: () => setPopoverVisible(true),
      }),
      [ref],
    );

    useEffect(() => {
      const closeOnScroll = () => {
        if (popoverVisible) {
          setPopoverVisible(false);
        }
      };
      document.addEventListener('scroll', closeOnScroll, true);
      return () => {
        document.removeEventListener('scroll', closeOnScroll, true);
      };
    }, [popoverVisible]);

    return (
      <div
        ref={ref}
        css={css`
          display: flex;
          align-items: center;
        `}
      >
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: ${theme.gridUnit * 4}px;
            margin-right: ${theme.gridUnit * 4}px;
            min-width: 0px; /* Allows shrinking */
            flex-shrink: 1; /* Allows shrinking in flex layout */
          `}
          data-test="container"
          style={style}
        >
          {notOverflowedItems.map(item => item.element)}
        </div>
        {popoverContent && (
          <>
            <Global
              styles={css`
                .antd5-popover-inner {
                  ::-webkit-scrollbar {
                    -webkit-appearance: none;
                    width: 14px;
                  }
                  ::-webkit-scrollbar-thumb {
                    border-radius: 9px;
                    background-color: ${theme.colors.grayscale.light1};
                    border: 3px solid transparent;
                    background-clip: content-box;
                  }
                  ::-webkit-scrollbar-track {
                    background-color: ${theme.colors.grayscale.light4};
                    border-left: 1px solid ${theme.colors.grayscale.light2};
                  }
                }
              `}
            />
            <Popover
              overlayInnerStyle={{
                maxHeight: `${MAX_HEIGHT}px`,
                overflow: showOverflow ? 'auto' : 'visible',
              }}
              content={popoverContent}
              trigger="click"
              open={popoverVisible}
              onOpenChange={visible => setPopoverVisible(visible)}
              placement="bottom"
              forceRender={forceRender}
            >
              <Tooltip title={dropdownTriggerTooltip}>
                <Button
                  buttonStyle="secondary"
                  data-test="dropdown-container-btn"
                >
                  {dropdownTriggerIcon}
                  {dropdownTriggerText}
                  <Badge
                    count={dropdownTriggerCount ?? overflowingCount}
                    color={
                      (dropdownTriggerCount ?? overflowingCount) > 0
                        ? theme.colors.primary.base
                        : theme.colors.grayscale.light1
                    }
                    showZero
                    css={css`
                      margin-left: ${theme.gridUnit * 2}px;
                    `}
                  />
                  <Icons.DownOutlined
                    iconSize="m"
                    iconColor={theme.colors.grayscale.light1}
                    css={css`
                      .anticon {
                        display: flex;
                      }
                    `}
                  />
                </Button>
              </Tooltip>
            </Popover>
          </>
        )}
      </div>
    );
  },
);

export default DropdownContainer;
