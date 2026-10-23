import type { ZhihuTableBlock, ZhihuTableCell } from './document';

export type NativeTableSection = 'head' | 'body' | 'foot';

export interface NativeTableSlot {
  readonly cell: ZhihuTableCell | null;
  readonly row: number;
  readonly column: number;
  readonly rowSpan: number;
  readonly colSpan: number;
  readonly section: NativeTableSection;
}

export interface NativeTableGrid {
  readonly cells: readonly NativeTableSlot[];
  readonly columnCount: number;
  readonly rowCount: number;
}

export interface NativeTableCellLayout extends NativeTableSlot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface NativeTableLayout {
  readonly cells: readonly NativeTableCellLayout[];
  readonly width: number;
  readonly height: number;
  readonly columnWidth: number;
  readonly rowHeights: readonly number[];
}

function positiveSpan(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0
    ? Math.min(value, 100)
    : 1;
}

/** Row groups bound rowspan, matching HTML tables rather than merging into the next group. */
export function placeNativeTableCells(block: ZhihuTableBlock): NativeTableGrid {
  const groups = [
    { section: 'head' as const, rows: block.head ?? [] },
    { section: 'body' as const, rows: block.body },
    { section: 'foot' as const, rows: block.foot ?? [] },
  ];
  const rowCount = groups.reduce(
    (total, group) => total + group.rows.length,
    0,
  );
  const occupied: boolean[][] = Array.from({ length: rowCount }, () => []);
  const cells: NativeTableSlot[] = [];
  const sections: NativeTableSection[] = [];
  let groupStart = 0;
  let columnCount = 0;

  for (const group of groups) {
    for (const [localRow, sourceRow] of group.rows.entries()) {
      const row = groupStart + localRow;
      sections[row] = group.section;
      let nextColumn = 0;
      for (const cell of sourceRow.cells) {
        const colSpan = positiveSpan(cell.colSpan);
        const rowSpan = Math.min(
          positiveSpan(cell.rowSpan),
          group.rows.length - localRow,
        );
        while (
          Array.from(
            { length: colSpan },
            (_, offset) => nextColumn + offset,
          ).some((column) => occupied[row][column])
        ) {
          nextColumn += 1;
        }
        const inheritedAlignment = block.columnAlignments?.[nextColumn];
        cells.push({
          cell:
            (!cell.alignment || cell.alignment === 'default') &&
            inheritedAlignment &&
            inheritedAlignment !== 'default'
              ? { ...cell, alignment: inheritedAlignment }
              : cell,
          row,
          column: nextColumn,
          rowSpan,
          colSpan,
          section: group.section,
        });
        for (let offsetRow = 0; offsetRow < rowSpan; offsetRow += 1) {
          for (
            let offsetColumn = 0;
            offsetColumn < colSpan;
            offsetColumn += 1
          ) {
            occupied[row + offsetRow][nextColumn + offsetColumn] = true;
          }
        }
        nextColumn += colSpan;
        columnCount = Math.max(columnCount, nextColumn);
      }
    }
    groupStart += group.rows.length;
  }

  // Uneven source rows still need empty slots; covered rowspan slots never add ghost cells.
  for (let row = 0; row < rowCount; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      if (!occupied[row][column]) {
        cells.push({
          cell: null,
          row,
          column,
          rowSpan: 1,
          colSpan: 1,
          section: sections[row],
        });
      }
    }
  }
  return { cells, columnCount, rowCount };
}

/** Measured heights include padding and border; only real cells introduce height constraints. */
export function measureNativeTableLayout(
  grid: NativeTableGrid,
  availableWidth: number,
  cellHeights: Readonly<Record<string, number>>,
  options: { minimumColumnWidth?: number; minimumRowHeight?: number } = {},
): NativeTableLayout {
  const minimumColumnWidth = Math.max(1, options.minimumColumnWidth ?? 150);
  const minimumRowHeight = Math.max(1, options.minimumRowHeight ?? 40);
  const safeWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const columnWidth =
    grid.columnCount > 0
      ? Math.max(minimumColumnWidth, safeWidth / grid.columnCount)
      : 0;
  const rowHeights = Array.from(
    { length: grid.rowCount },
    () => minimumRowHeight,
  );
  const measuredHeight = (slot: NativeTableSlot) => {
    const height = slot.cell ? cellHeights[slot.cell.id] : undefined;
    return height !== undefined && Number.isFinite(height) && height > 0
      ? height
      : minimumRowHeight;
  };

  for (const slot of grid.cells) {
    if (slot.rowSpan === 1)
      rowHeights[slot.row] = Math.max(
        rowHeights[slot.row],
        measuredHeight(slot),
      );
  }
  // Solve short spans first. Heights only grow, so later constraints cannot invalidate earlier ones.
  const spanningCells = grid.cells
    .filter((slot) => slot.rowSpan > 1)
    .sort((first, second) => first.rowSpan - second.rowSpan);
  for (const slot of spanningCells) {
    const allocatedHeight = rowHeights
      .slice(slot.row, slot.row + slot.rowSpan)
      .reduce((total, height) => total + height, 0);
    const extraHeight = Math.max(0, measuredHeight(slot) - allocatedHeight);
    if (extraHeight > 0) {
      const increase = extraHeight / slot.rowSpan;
      for (let offset = 0; offset < slot.rowSpan; offset += 1) {
        rowHeights[slot.row + offset] += increase;
      }
    }
  }
  const rowTops = [0];
  for (const height of rowHeights)
    rowTops.push(rowTops[rowTops.length - 1] + height);
  return {
    width: columnWidth * grid.columnCount,
    height: rowTops[grid.rowCount],
    columnWidth,
    rowHeights,
    cells: grid.cells.map((slot) => ({
      ...slot,
      left: slot.column * columnWidth,
      top: rowTops[slot.row],
      width: slot.colSpan * columnWidth,
      height: rowTops[slot.row + slot.rowSpan] - rowTops[slot.row],
    })),
  };
}
