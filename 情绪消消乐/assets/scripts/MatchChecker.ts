import { CellState, MatchGroup } from './GameTypes';

export class MatchChecker {
  findMatches(grid: (CellState | null)[][]): MatchGroup[] {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    const groups: MatchGroup[] = [];
    const groupKeys = new Set<string>();

    for (let row = 0; row < height; row++) {
      let startCol = 0;
      let count = 1;

      for (let col = 1; col <= width; col++) {
        const previous = grid[row]?.[col - 1];
        const current = col < width ? grid[row]?.[col] : null;
        if (previous && current && previous.type === current.type) {
          count++;
          continue;
        }

        if (previous && count >= 3) {
          const cells: CellState[] = [];
          for (let c = startCol; c < col; c++) {
            const cell = grid[row]?.[c];
            if (cell) cells.push(cell);
          }
          this.addGroup(groups, groupKeys, cells, true, false);
        }
        startCol = col;
        count = 1;
      }
    }

    for (let col = 0; col < width; col++) {
      let startRow = 0;
      let count = 1;

      for (let row = 1; row <= height; row++) {
        const previous = grid[row - 1]?.[col];
        const current = row < height ? grid[row]?.[col] : null;
        if (previous && current && previous.type === current.type) {
          count++;
          continue;
        }

        if (previous && count >= 3) {
          const cells: CellState[] = [];
          for (let r = startRow; r < row; r++) {
            const cell = grid[r]?.[col];
            if (cell) cells.push(cell);
          }
          this.addGroup(groups, groupKeys, cells, false, true);
        }
        startRow = row;
        count = 1;
      }
    }

    return this.mergeCrosses(groups);
  }

  flattenMatches(groups: MatchGroup[]): CellState[] {
    const matchSet = new Map<string, CellState>();
    groups.forEach((group) => {
      group.cells.forEach((cell) => matchSet.set(`${cell.row}_${cell.col}`, cell));
    });
    return [...matchSet.values()];
  }

  private addGroup(groups: MatchGroup[], groupKeys: Set<string>, cells: CellState[], horizontal: boolean, vertical: boolean) {
    if (cells.length < 3) return;
    const key = cells.map((cell) => `${cell.row}_${cell.col}`).sort().join('|');
    if (groupKeys.has(key)) return;
    groupKeys.add(key);
    groups.push({
      cells,
      type: cells[0].type,
      horizontal,
      vertical,
      isLine4: cells.length === 4,
      isLine5: cells.length >= 5,
      isCross: false,
    });
  }

  private mergeCrosses(groups: MatchGroup[]): MatchGroup[] {
    const merged = [...groups];
    const crossKeys = new Set<string>();
    for (const horizontal of groups.filter((group) => group.horizontal)) {
      for (const vertical of groups.filter((group) => group.vertical && group.type === horizontal.type)) {
        const hasOverlap = horizontal.cells.some((a) => vertical.cells.some((b) => a.row === b.row && a.col === b.col));
        if (!hasOverlap) continue;
        const cells = new Map<string, CellState>();
        [...horizontal.cells, ...vertical.cells].forEach((cell) => cells.set(`${cell.row}_${cell.col}`, cell));
        const key = [...cells.keys()].sort().join('|');
        if (crossKeys.has(key)) continue;
        crossKeys.add(key);
        merged.push({
          cells: [...cells.values()],
          type: horizontal.type,
          horizontal: true,
          vertical: true,
          isLine4: false,
          isLine5: false,
          isCross: true,
        });
      }
    }
    return merged;
  }
}
