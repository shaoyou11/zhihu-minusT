import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ZhihuTableBlock, ZhihuTableCell } from '../document';
import { walkZhihuDocument } from '../documentTraversal';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import {
  measureNativeTableLayout,
  placeNativeTableCells,
} from '../tableLayout';

function table(html: string): ZhihuTableBlock {
  const { document } = normalizeZhihuDocument(html, { documentId: 'test' });
  const result = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'table',
  );
  if (!result) throw new Error('Expected a normalized table');
  return result;
}

const cell = (id: string, colSpan = 1, rowSpan = 1): ZhihuTableCell => ({
  id,
  isHeader: false,
  blocks: [],
  colSpan,
  rowSpan,
});

describe('Native V2 table occupancy and content-driven heights', () => {
  it('places combined row/column spans without overlapping later cells', () => {
    const block = table(
      '<table><tbody><tr><td rowspan="2" colspan="2">A</td><td>B</td></tr><tr><td>C</td></tr><tr><td>D</td><td colspan="2">E</td></tr></tbody></table>',
    );
    const grid = placeNativeTableCells(block);
    expect(grid.rowCount).toBe(3);
    expect(grid.columnCount).toBe(3);
    expect(
      grid.cells.map(({ row, column, rowSpan, colSpan }) => ({
        row,
        column,
        rowSpan,
        colSpan,
      })),
    ).toEqual([
      { row: 0, column: 0, rowSpan: 2, colSpan: 2 },
      { row: 0, column: 2, rowSpan: 1, colSpan: 1 },
      { row: 1, column: 2, rowSpan: 1, colSpan: 1 },
      { row: 2, column: 0, rowSpan: 1, colSpan: 1 },
      { row: 2, column: 1, rowSpan: 1, colSpan: 2 },
    ]);
  });

  it('fills uneven rows while preserving occupied slots and completely spanned rows', () => {
    const block: ZhihuTableBlock = {
      id: 'table',
      type: 'table',
      body: [
        { id: 'r0', cells: [cell('a', 1, 3), cell('b', 1, 2), cell('c')] },
        { id: 'r1', cells: [] },
        { id: 'r2', cells: [cell('d', 2)] },
      ],
    };
    const grid = placeNativeTableCells(block);
    expect(grid.columnCount).toBe(3);
    expect(
      grid.cells
        .filter((slot) => !slot.cell)
        .map(({ row, column }) => ({
          row,
          column,
        })),
    ).toEqual([{ row: 1, column: 2 }]);
    const placed = grid.cells.find((slot) => slot.cell?.id === 'd');
    expect(placed).toMatchObject({ row: 2, column: 1, colSpan: 2 });

    const fullySpanned = placeNativeTableCells({
      id: 'all',
      type: 'table',
      body: [
        { id: 'r0', cells: [cell('a', 2, 2)] },
        { id: 'r1', cells: [] },
      ],
    });
    expect(fullySpanned.cells).toHaveLength(1);
    expect(measureNativeTableLayout(fullySpanned, 320, { a: 110 }).height).toBe(
      110,
    );
  });

  it('keeps multirow header/footer groups and clamps rowspan at their boundaries', () => {
    const block = table(
      '<table><thead><tr><th rowspan="10">H</th><th>H1</th></tr><tr><th>H2</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody><tfoot><tr><td rowspan="3">F</td><td>F1</td></tr><tr><td>F2</td></tr></tfoot></table>',
    );
    const grid = placeNativeTableCells(block);
    expect(grid.rowCount).toBe(5);
    expect(grid.columnCount).toBe(2);
    expect(grid.cells.filter((slot) => slot.section === 'head')).toHaveLength(
      3,
    );
    expect(grid.cells.filter((slot) => slot.section === 'body')).toHaveLength(
      2,
    );
    expect(grid.cells.filter((slot) => slot.section === 'foot')).toHaveLength(
      3,
    );
    expect(grid.cells[0]).toMatchObject({ rowSpan: 2 });
    expect(grid.cells[3]).toMatchObject({ row: 2, column: 0, rowSpan: 1 });
    expect(grid.cells[5]).toMatchObject({ row: 3, column: 0, rowSpan: 2 });
  });

  it('inherits column alignment without overwriting explicit cell alignment or mutating source cells', () => {
    const first = cell('first');
    const second = { ...cell('second'), alignment: 'right' as const };
    const grid = placeNativeTableCells({
      id: 'aligned',
      type: 'table',
      columnAlignments: ['center', 'left'],
      body: [{ id: 'row', cells: [first, second] }],
    });
    expect(grid.cells[0].cell).toMatchObject({ alignment: 'center' });
    expect(grid.cells[1].cell).toBe(second);
    expect(first.alignment).toBeUndefined();
  });

  it('allocates measured multiline content and satisfies every overlapping row-height constraint', () => {
    const grid = placeNativeTableCells({
      id: 'heights',
      type: 'table',
      body: [
        { id: 'r0', cells: [cell('a', 1, 2), cell('b')] },
        { id: 'r1', cells: [cell('c', 1, 2)] },
        { id: 'r2', cells: [cell('d')] },
      ],
    });
    const measurements = { a: 160, b: 50, c: 210, d: 70 };
    const layout = measureNativeTableLayout(grid, 420, measurements);
    expect(layout.columnWidth).toBe(210);
    expect(
      layout.cells.find((slot) => slot.cell?.id === 'a')?.height,
    ).toBeGreaterThanOrEqual(measurements.a);
    expect(
      layout.cells.find((slot) => slot.cell?.id === 'c')?.height,
    ).toBeGreaterThanOrEqual(measurements.c);
    expect(layout.rowHeights[0]).toBeGreaterThanOrEqual(measurements.b);
    expect(layout.rowHeights[2]).toBeGreaterThanOrEqual(measurements.d);
    for (const slot of layout.cells) {
      if (slot.cell)
        expect(slot.height).toBeGreaterThanOrEqual(
          measurements[slot.cell.id as keyof typeof measurements],
        );
      expect(slot.top + slot.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it('uses the stored Zhihu formula/table case without losing its six rows or header cells', () => {
    const source: unknown = JSON.parse(
      readFileSync(
        path.join(
          __dirname,
          '../fixtures/cases/question-feed-card-formula-table-001.json',
        ),
        'utf8',
      ),
    );
    if (!source || typeof source !== 'object' || !('target' in source))
      throw new Error('Expected fixture target');
    const target = source.target;
    if (
      !target ||
      typeof target !== 'object' ||
      !('content' in target) ||
      typeof target.content !== 'string'
    )
      throw new Error('Expected fixture HTML');
    const grid = placeNativeTableCells(table(target.content));
    expect(grid.rowCount).toBe(6);
    expect(grid.columnCount).toBe(2);
    expect(grid.cells).toHaveLength(12);
    expect(grid.cells.filter((slot) => slot.cell?.isHeader)).toHaveLength(2);
    expect(grid.cells.some((slot) => !slot.cell)).toBe(false);
  });

  it('handles empty tables, invalid dimensions and stale/nonfinite measurements', () => {
    const empty = placeNativeTableCells({
      id: 'empty',
      type: 'table',
      body: [],
    });
    expect(measureNativeTableLayout(empty, Number.NaN, {})).toMatchObject({
      width: 0,
      height: 0,
      cells: [],
    });
    const grid = placeNativeTableCells({
      id: 'invalid',
      type: 'table',
      body: [
        { id: 'row', cells: [cell('a', -1, 0), cell('b', 1.5, Number.NaN)] },
      ],
    });
    const layout = measureNativeTableLayout(grid, -10, {
      a: Number.NaN,
      b: -40,
      unrelated: 999,
    });
    expect(Number.isFinite(layout.width)).toBe(true);
    expect(Number.isFinite(layout.height)).toBe(true);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
    expect(
      grid.cells.every((slot) => slot.rowSpan === 1 && slot.colSpan === 1),
    ).toBe(true);
  });
});
