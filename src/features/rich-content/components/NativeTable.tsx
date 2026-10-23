import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { ZhihuTableBlock, ZhihuTableCell } from '../document';
import {
  measureNativeTableLayout,
  placeNativeTableCells,
} from '../tableLayout';

export interface NativeTableProps {
  block: ZhihuTableBlock;
  width: number;
  borderColor: string;
  surfaceColor: string;
  caption?: ReactNode;
  /** Receives the content width after the cell's border and padding. */
  renderCell: (cell: ZhihuTableCell, width: number) => ReactNode;
}

interface CellMeasurements {
  block: ZhihuTableBlock;
  columnWidth: number;
  heights: Record<string, number>;
}

const CELL_PADDING = 8;
const CELL_BORDER = 1;

export function NativeTable({
  block,
  width,
  borderColor,
  surfaceColor,
  caption,
  renderCell,
}: NativeTableProps) {
  const grid = useMemo(() => placeNativeTableCells(block), [block]);
  const initialLayout = useMemo(
    () => measureNativeTableLayout(grid, width, {}),
    [grid, width],
  );
  const [measurements, setMeasurements] = useState<CellMeasurements | null>(
    null,
  );
  const activeInput = useRef({ block, columnWidth: initialLayout.columnWidth });
  activeInput.current = { block, columnWidth: initialLayout.columnWidth };
  const layout = measureNativeTableLayout(
    grid,
    width,
    measurements?.block === block &&
      measurements.columnWidth === initialLayout.columnWidth
      ? measurements.heights
      : {},
  );

  return (
    <View style={{ width, marginBottom: 14 }}>
      {caption}
      <ScrollView
        horizontal
        style={{ width }}
        contentContainerStyle={{ width: layout.width }}
      >
        <View style={{ width: layout.width, height: layout.height }}>
          {layout.cells.map((slot) => {
            const cell = slot.cell;
            const innerWidth = Math.max(1, slot.width - CELL_BORDER * 2);
            const contentWidth = Math.max(1, innerWidth - CELL_PADDING * 2);
            return (
              <View
                key={cell?.id ?? `${block.id}:empty:${slot.row}:${slot.column}`}
                style={[
                  styles.cell,
                  {
                    left: slot.left,
                    top: slot.top,
                    width: slot.width,
                    height: slot.height,
                    borderColor,
                    backgroundColor:
                      cell?.isHeader || slot.section === 'head'
                        ? surfaceColor
                        : 'transparent',
                  },
                ]}
              >
                {cell ? (
                  <View
                    style={{ width: innerWidth, padding: CELL_PADDING }}
                    onLayout={(event) => {
                      if (
                        activeInput.current.block !== block ||
                        activeInput.current.columnWidth !== layout.columnWidth
                      )
                        return;
                      const height =
                        event.nativeEvent.layout.height + CELL_BORDER * 2;
                      if (!Number.isFinite(height) || height <= 0) return;
                      setMeasurements((previous) => {
                        const current =
                          previous?.block === block &&
                          previous.columnWidth === layout.columnWidth
                            ? previous.heights
                            : {};
                        if (Math.abs((current[cell.id] ?? 0) - height) < 0.5)
                          return previous;
                        return {
                          block,
                          columnWidth: layout.columnWidth,
                          heights: { ...current, [cell.id]: height },
                        };
                      });
                    }}
                  >
                    {renderCell(cell, contentWidth)}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    position: 'absolute',
    borderWidth: CELL_BORDER,
  },
});
