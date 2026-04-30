import { BlockType, CellState, MatchGroup, SpecialType } from './GameTypes';

export class MatchChecker {
  findMatches(grid: (CellState | null)[][]): MatchGroup[] {
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    const groups: MatchGroup[] = [];

    for (let row = 0; row < height; row++) {
      let startCol = 0;
      let currentType: BlockType | null = null;
      let count = 0;

      for (let col = 0; col <= width; col++) {
        const cell = col < width ? grid[row]?.[col] : null;
        const type = this.matchableType(cell);

        if (type && type === currentType) {
          count++;
          continue;
        }

        if (currentType && count >= 3) {
          const cells: CellState[] = [];
          for (let c = startCol; c < startCol + count; c++) {
            const matched = grid[row]?.[c];
            if (matched) cells.push(matched);
          }
          this.addGroup(groups, cells, true, false);
        }

        currentType = type;
        startCol = col;
        count = type ? 1 : 0;
      }
    }

    for (let col = 0; col < width; col++) {
      let startRow = 0;
      let currentType: BlockType | null = null;
      let count = 0;

      for (let row = 0; row <= height; row++) {
        const cell = row < height ? grid[row]?.[col] : null;
        const type = this.matchableType(cell);

        if (type && type === currentType) {
          count++;
          continue;
        }

        if (currentType && count >= 3) {
          const cells: CellState[] = [];
          for (let r = startRow; r < startRow + count; r++) {
            const matched = grid[r]?.[col];
            if (matched) cells.push(matched);
          }
          this.addGroup(groups, cells, false, true);
        }

        currentType = type;
        startRow = row;
        count = type ? 1 : 0;
      }
    }

    return this.markCrosses(groups);
  }

  flattenMatches(groups: MatchGroup[]): CellState[] {
    const matches = new Map<string, CellState>();
    groups.forEach((group) => {
      group.cells.forEach((cell) => matches.set(`${cell.row}_${cell.col}`, cell));
    });
    return [...matches.values()];
  }

  runSelfTest() {
    const tests = [
      { name: 'horizontal 3', grid: [['A', 'A', 'A', 'B', 'C', 'D']], expected: 3 },
      { name: 'horizontal 4', grid: [['A', 'A', 'A', 'A', 'C', 'D']], expected: 4 },
      { name: 'horizontal 5', grid: [['A', 'A', 'A', 'A', 'A', 'D']], expected: 5 },
      { name: 'vertical 5', grid: [['A'], ['A'], ['A'], ['A'], ['A'], ['D']], expected: 5 },
      {
        name: 'cross',
        grid: [
          ['B', 'B', 'A', 'C', 'D'],
          ['C', 'D', 'A', 'B', 'C'],
          ['A', 'A', 'A', 'A', 'A'],
          ['D', 'C', 'A', 'D', 'B'],
        ],
        expected: 8,
      },
    ];

    tests.forEach((test) => {
      const grid = this.mockGrid(test.grid);
      const actual = this.flattenMatches(this.findMatches(grid)).length;
      const line = `[MatchTest] ${test.name} expected=${test.expected} actual=${actual}`;
      if (actual === test.expected) console.log(line);
      else console.error(line);
    });
  }

  private addGroup(groups: MatchGroup[], cells: CellState[], horizontal: boolean, vertical: boolean) {
    if (cells.length < 3) return;
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

  private matchableType(cell: CellState | null | undefined): BlockType | null {
    if (!cell || cell.type === BlockType.Sunshine) return null;
    return cell.type;
  }

  private markCrosses(groups: MatchGroup[]): MatchGroup[] {
    groups.forEach((group) => {
      group.isCross = groups.some((other) => {
        if (group === other || group.type !== other.type || group.horizontal === other.horizontal) return false;
        return group.cells.some((a) => other.cells.some((b) => a.row === b.row && a.col === b.col));
      });
    });
    return groups;
  }

  private mockGrid(layout: string[][]): CellState[][] {
    return layout.map((line, row) => line.map((key, col) => ({
      row,
      col,
      type: this.mockType(key),
      special: SpecialType.None,
      fog: false,
      chained: false,
      cloud: false,
      node: null as never,
    })));
  }

  private mockType(key: string): BlockType {
    const map: Record<string, BlockType> = {
      A: BlockType.Annoyed,
      B: BlockType.Anxiety,
      C: BlockType.Pressure,
      D: BlockType.Sad,
    };
    return map[key] ?? BlockType.Badluck;
  }
}
