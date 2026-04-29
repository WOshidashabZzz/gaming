import { BoardPos, CellState, ObstacleCounts } from './GameTypes';

export class ObstacleManager {
  apply(grid: (CellState | null)[][], obstacles: ObstacleCounts) {
    this.clear(grid);
    this.placeFog(grid, obstacles.fog);
  }

  restoreFog(grid: (CellState | null)[][], fogMap: boolean[][]) {
    this.clear(grid);
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
        const cell = grid[row]?.[col];
        if (cell) cell.fog = !!fogMap[row]?.[col];
      }
    }
  }

  unlockNear(_grid: (CellState | null)[][], _cleared: CellState[]): number {
    return 0;
  }

  spreadCloud(_grid: (CellState | null)[][]): boolean {
    return false;
  }

  private clear(grid: (CellState | null)[][]) {
    grid.flat().forEach((cell) => {
      if (!cell) return;
      cell.fog = false;
      cell.chained = false;
      cell.cloud = false;
    });
  }

  private placeFog(grid: (CellState | null)[][], count: number) {
    if (count <= 0) return;
    const height = grid.length;
    const width = grid[0]?.length ?? 0;
    const rowCounts = new Array(height).fill(0);
    const colCounts = new Array(width).fill(0);
    const positions: BoardPos[] = [];
    let attempts = 0;

    while (positions.length < count && attempts < 1000) {
      attempts++;
      const row = Math.floor(Math.random() * height);
      const col = Math.floor(Math.random() * width);
      if (rowCounts[row] >= 3 || colCounts[col] >= 3) continue;
      if (positions.some((pos) => pos.row === row && pos.col === col)) continue;
      positions.push({ row, col });
      rowCounts[row]++;
      colCounts[col]++;
    }

    for (let row = 0; row < height && positions.length < count; row++) {
      for (let col = 0; col < width && positions.length < count; col++) {
        if (positions.some((pos) => pos.row === row && pos.col === col)) continue;
        positions.push({ row, col });
      }
    }

    positions.forEach((pos) => {
      const cell = grid[pos.row]?.[pos.col];
      if (cell) cell.fog = true;
    });
  }
}
