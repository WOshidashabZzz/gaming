import { BoardPos, CellState, ObstacleConfig, ObstacleType } from './GameTypes';

export class ObstacleManager {
  apply(grid: (CellState | null)[][], obstacles: ObstacleConfig[]) {
    obstacles.forEach((obstacle) => {
      obstacle.positions.forEach((pos) => {
        const cell = grid[pos.row]?.[pos.col];
        if (!cell) return;
        if (obstacle.type === ObstacleType.Fog) cell.fog = true;
        if (obstacle.type === ObstacleType.Chain) cell.chained = true;
        if (obstacle.type === ObstacleType.Cloud) cell.cloud = true;
      });
    });
  }

  unlockNear(grid: (CellState | null)[][], cleared: CellState[]): number {
    let count = 0;
    cleared.forEach((cell) => {
      this.neighbors(cell).forEach((pos) => {
        const target = grid[pos.row]?.[pos.col];
        if (target?.chained) {
          target.chained = false;
          count++;
        }
      });
    });
    return count;
  }

  spreadCloud(grid: (CellState | null)[][]): boolean {
    const cloudy = grid.flat().filter((cell): cell is CellState => !!cell && cell.cloud);
    if (cloudy.length === 0 || cloudy.length > 7) return false;
    const origin = cloudy[Math.floor(Math.random() * cloudy.length)];
    const options = this.neighbors(origin).map((p) => grid[p.row]?.[p.col]).filter((c): c is CellState => !!c && !c.cloud);
    if (options.length === 0) return false;
    options[Math.floor(Math.random() * options.length)].cloud = true;
    return true;
  }

  private neighbors(cell: BoardPos): BoardPos[] {
    return [
      { row: cell.row - 1, col: cell.col },
      { row: cell.row + 1, col: cell.col },
      { row: cell.row, col: cell.col - 1 },
      { row: cell.row, col: cell.col + 1 },
    ];
  }
}
