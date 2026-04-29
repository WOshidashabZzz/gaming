import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, tween, UITransform, Vec2, Vec3 } from 'cc';
import { Block } from './Block';
import { BlockType, CellState, GoalProgressEvent, LevelConfig, NEGATIVE_BLOCKS, POSITIVE_BLOCKS, SpecialType } from './GameTypes';
import { MatchChecker } from './MatchChecker';
import { ObstacleManager } from './ObstacleManager';

const { ccclass } = _decorator;
const DEBUG_MATCH3 = true;

function hexColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return new Color(r, g, b, a);
}

type ResolveCallback = (event: GoalProgressEvent, energyPayload: { negative: number; combo: number }) => void;

@ccclass('BoardManager')
export class BoardManager extends Component {
  onResolve: ResolveCallback | null = null;
  onMoveConsumed: (() => void) | null = null;
  onCanMove: (() => boolean) | null = null;
  onFeedback: ((text: string) => void) | null = null;

  private level!: LevelConfig;
  private grid: (CellState | null)[][] = [];
  private nodes: (Node | null)[][] = [];
  private checker = new MatchChecker();
  private obstacles = new ObstacleManager();
  private selected: CellState | null = null;
  private boardLocked = false;
  private cellSize = 72;
  private combo = 0;
  private movesSinceCloud = 0;
  private blockPool: Node[] = [];
  private dragStartCell: CellState | null = null;
  private dragStartPos: Vec2 | null = null;
  private dragResolved = false;

  setup(level: LevelConfig, boardSize: number) {
    this.level = level;
    this.cellSize = Math.floor(boardSize / level.boardWidth);
    this.recycleAllBlocks();
    this.node.getComponent(UITransform)?.setContentSize(this.cellSize * level.boardWidth, this.cellSize * level.boardHeight);
    this.registerBoardInput();
    this.selected = null;
    this.dragStartCell = null;
    this.dragStartPos = null;
    this.dragResolved = false;
    this.boardLocked = false;
    this.combo = 0;
    this.movesSinceCloud = 0;
    this.createGrid();
    this.obstacles.apply(this.grid, level.obstacles);
    this.renderAll();
    this.debugCheckBoardIntegrity('setup');
  }

  lockBoard() {
    this.boardLocked = true;
    this.clearDrag();
    this.selected = null;
  }

  triggerEmotionRelease(): GoalProgressEvent {
    if (this.boardLocked) return this.emptyEvent();
    this.boardLocked = true;
    const candidates = this.grid.flat().filter((cell): cell is CellState => !!cell && NEGATIVE_BLOCKS.includes(cell.type));
    const picked = candidates.sort(() => Math.random() - 0.5).slice(0, 8);
    const event = this.clearCells(picked, 5, true);
    void this.delay(0.18).then(async () => {
      if (this.shouldStopResolving()) return;
      await this.collapseAndFill();
      this.debugCheckBoardIntegrity('emotion release fill');
      this.boardLocked = false;
    });
    return event;
  }

  private createGrid() {
    this.grid = [];
    this.nodes = [];
    for (let row = 0; row < this.level.boardHeight; row++) {
      this.grid[row] = [];
      this.nodes[row] = [];
      for (let col = 0; col < this.level.boardWidth; col++) {
        this.grid[row][col] = this.randomCell(row, col);
        this.nodes[row][col] = null;
      }
    }
    while (this.checker.findMatches(this.grid).length > 0) {
      this.grid.flat().forEach((cell) => {
        if (cell) cell.type = this.randomType();
      });
    }
    let attempts = 0;
    while (!this.hasAnyMove() && attempts < 30) {
      this.grid.flat().forEach((cell) => {
        if (cell) cell.type = this.randomType();
      });
      while (this.checker.findMatches(this.grid).length > 0) {
        this.grid.flat().forEach((cell) => {
          if (cell) cell.type = this.randomType();
        });
      }
      attempts++;
    }
  }

  private renderAll() {
    this.recycleAllBlocks();
    this.nodes = [];
    for (let row = 0; row < this.level.boardHeight; row++) this.nodes[row] = [];
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const cell = this.grid[row]?.[col];
        if (cell) this.renderCell(cell);
        else this.debug('null render skip', `row=${row} col=${col}`);
      }
    }
  }

  private renderCell(cell: CellState, startPos?: Vec3): Node {
    let node = this.nodes[cell.row]?.[cell.col];
    if (!node) {
      node = this.blockPool.pop() ?? new Node('block');
      node.parent = this.node;
      node.active = true;
      if (!node.getComponent(UITransform)) node.addComponent(UITransform);
      if (!node.getComponent(Block)) node.addComponent(Block);
      if (!this.nodes[cell.row]) this.nodes[cell.row] = [];
      this.nodes[cell.row][cell.col] = node;
    }
    node.setPosition(startPos ?? this.positionOf(cell.row, cell.col));
    node.getComponent(Block)!.setup(cell, this.cellSize - 10);
    this.renderObstacleOverlays(node, cell);
    return node;
  }

  private registerBoardInput() {
    this.node.off(Node.EventType.TOUCH_START);
    this.node.off(Node.EventType.TOUCH_MOVE);
    this.node.off(Node.EventType.TOUCH_END);
    this.node.off(Node.EventType.TOUCH_CANCEL);
    this.node.on(Node.EventType.TOUCH_START, this.handleBoardTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.handleTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.handleBoardTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, () => this.clearDrag(), this);
  }

  private handleBoardTouchStart(event: EventTouch) {
    const cell = this.cellAtEvent(event);
    if (cell) this.handleTouchStart(cell, event);
  }

  private handleBoardTouchEnd(event: EventTouch) {
    const cell = this.dragStartCell ?? this.cellAtEvent(event);
    if (!cell) {
      this.clearDrag();
      return;
    }
    this.handleTouchEnd(cell);
  }

  private cellAtEvent(event: EventTouch): CellState | null {
    const transform = this.node.getComponent(UITransform);
    if (!transform) return null;
    const location = event.getUILocation();
    const local = transform.convertToNodeSpaceAR(new Vec3(location.x, location.y, 0));
    const width = this.level.boardWidth * this.cellSize;
    const height = this.level.boardHeight * this.cellSize;
    const col = Math.floor((local.x + width / 2) / this.cellSize);
    const row = Math.floor((local.y + height / 2) / this.cellSize);
    if (row < 0 || row >= this.level.boardHeight || col < 0 || col >= this.level.boardWidth) return null;
    return this.grid[row]?.[col] ?? null;
  }

  private renderObstacleOverlays(node: Node, cell: CellState) {
    ['fog', 'chain', 'cloud'].forEach((name) => node.getChildByName(name)?.destroy());
    if (cell.fog) this.overlay(node, 'fog', '#34344faa', '雾');
    if (cell.chained) this.overlay(node, 'chain', '#f2eefaaa', '锁');
    if (cell.cloud) this.overlay(node, 'cloud', '#5f6077bb', '云');
  }

  private overlay(parent: Node, name: string, color: string, text: string) {
    const node = new Node(name);
    node.parent = parent;
    node.addComponent(UITransform).setContentSize(this.cellSize - 16, this.cellSize - 16);
    const size = this.cellSize - 16;
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = hexColor(color);
    graphics.roundRect(-size / 2, -size / 2, size, size, 10);
    graphics.fill();
    const labelNode = new Node('label');
    labelNode.parent = node;
    labelNode.addComponent(UITransform).setContentSize(this.cellSize - 16, 30);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 22;
    label.lineHeight = 26;
    label.color = hexColor('#ffffff');
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
  }

  private handleTouchStart(cell: CellState, event: EventTouch) {
    if (this.isInputLocked() || cell.chained) return;
    this.debug('selected', this.describeCell(cell));
    this.dragStartCell = cell;
    this.dragStartPos = event.getUILocation();
    this.dragResolved = false;
    if (!this.selected) this.nodes[cell.row]?.[cell.col]?.getComponent(Block)?.setSelected(true);
  }

  private handleTouchMove(event: EventTouch) {
    if (this.isInputLocked() || !this.dragStartCell || !this.dragStartPos || this.dragResolved) return;
    const current = event.getUILocation();
    const deltaX = current.x - this.dragStartPos.x;
    const deltaY = current.y - this.dragStartPos.y;
    const threshold = Math.max(18, this.cellSize * 0.3);
    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) return;

    const start = this.dragStartCell;
    const target = Math.abs(deltaX) >= Math.abs(deltaY)
      ? this.grid[start.row]?.[start.col + (deltaX > 0 ? 1 : -1)]
      : this.grid[start.row + (deltaY > 0 ? 1 : -1)]?.[start.col];
    if (!target) return;
    this.dragResolved = true;
    if (this.selected) {
      this.nodes[this.selected.row]?.[this.selected.col]?.getComponent(Block)?.setSelected(false);
      this.selected = null;
    }
    this.nodes[start.row]?.[start.col]?.getComponent(Block)?.setSelected(false);
    this.dragStartCell = null;
    this.dragStartPos = null;
    this.debug('drag target', this.describeCell(target));
    void this.swapAndResolve(start, target);
  }

  private handleTouchEnd(cell: CellState) {
    if (this.dragResolved) {
      this.clearDrag();
      return;
    }
    this.clearDrag(false);
    this.handleTap(cell);
  }

  private handleTap(cell: CellState) {
    if (this.isInputLocked() || cell.chained) return;
    if (!this.selected) {
      this.selected = cell;
      this.nodes[cell.row]?.[cell.col]?.getComponent(Block)?.setSelected(true);
      return;
    }
    const previous = this.selected;
    this.nodes[previous.row]?.[previous.col]?.getComponent(Block)?.setSelected(false);
    this.selected = null;
    if (previous.row === cell.row && previous.col === cell.col) return;
    if (Math.abs(previous.row - cell.row) + Math.abs(previous.col - cell.col) !== 1) {
      this.selected = cell;
      this.nodes[cell.row]?.[cell.col]?.getComponent(Block)?.setSelected(true);
      return;
    }
    this.debug('tap target', this.describeCell(cell));
    void this.swapAndResolve(previous, cell);
  }

  private clearDrag(clearSelection = true) {
    if (clearSelection && this.dragStartCell) {
      this.nodes[this.dragStartCell.row]?.[this.dragStartCell.col]?.getComponent(Block)?.setSelected(false);
    }
    this.dragStartCell = null;
    this.dragStartPos = null;
    this.dragResolved = false;
  }

  private async swapAndResolve(a: CellState, b: CellState) {
    if (this.isInputLocked() || a.chained || b.chained) return;
    const nodeA = this.nodes[a.row]?.[a.col];
    const nodeB = this.nodes[b.row]?.[b.col];
    if (!nodeA || !nodeB) {
      this.debug('swap blocked', `missing node: ${this.describeCell(a)} / ${this.describeCell(b)}`);
      return;
    }

    this.boardLocked = true;
    this.debug('swap start', `${this.describeCell(a)} <-> ${this.describeCell(b)}`);
    this.swapStates(a, b);
    this.swapNodeRefs(a, b, nodeA, nodeB);
    await Promise.all([
      this.animateNodeTo(nodeA, this.positionOf(a.row, a.col), 0.15),
      this.animateNodeTo(nodeB, this.positionOf(b.row, b.col), 0.15),
    ]);
    this.debug('swap animation end', `${this.describeCell(a)} / ${this.describeCell(b)}`);
    this.debugCheckBoardIntegrity('after swap');

    const specialEvent = this.resolveSpecialSwap(a, b);
    if (specialEvent) {
      this.debug('swap valid special', this.describeEvent(specialEvent));
      this.onMoveConsumed?.();
      this.onResolve?.(specialEvent, { negative: this.countNegative(specialEvent), combo: 1 });
      if (!this.shouldStopResolving()) {
        await this.delay(0.18);
      await this.collapseAndFill();
        this.debugCheckBoardIntegrity('after special fill');
        this.afterPlayerMove();
        this.boardLocked = false;
      }
      return;
    }

    const groups = this.checker.findMatches(this.grid);
    this.debug('match count', String(groups.length));
    if (groups.length === 0) {
      this.swapStates(a, b);
      this.swapNodeRefs(a, b, nodeA, nodeB);
      await Promise.all([
        this.animateNodeTo(nodeA, this.positionOf(a.row, a.col), 0.12),
        this.animateNodeTo(nodeB, this.positionOf(b.row, b.col), 0.12),
      ]);
      this.debug('swap invalid', 'no match, reverted');
      this.debugCheckBoardIntegrity('after swap back');
      this.boardLocked = false;
      return;
    }

    this.debug('swap valid', groups.map((group) => `${group.type}:${group.cells.length}`).join(', '));
    this.onMoveConsumed?.();
    await this.resolveCascade(groups);
    this.debugCheckBoardIntegrity('cascade end');
    if (!this.shouldStopResolving()) this.afterPlayerMove();
    this.boardLocked = false;
  }

  private async resolveCascade(initialGroups = this.checker.findMatches(this.grid)) {
    let groups = initialGroups;
    this.combo = 0;
    while (groups.length > 0) {
      this.combo++;
      const special = this.createSpecialFromGroups(groups);
      let cells = this.uniqueCells(groups.flatMap((group) => group.cells));
      if (special) cells = cells.filter((cell) => cell.row !== special.row || cell.col !== special.col);
      const event = this.clearCells(cells, this.combo, false);
      this.debug('cleared', this.describeEvent(event));
      this.debugCheckBoardIntegrity('after clear');
      if (special && this.grid[special.row]?.[special.col]) this.grid[special.row]![special.col]!.special = special.special;
      this.onResolve?.(event, { negative: this.countNegative(event), combo: this.combo });
      if (this.combo === 2) this.onFeedback?.('不错！');
      if (this.combo === 3) this.onFeedback?.('好多了！');
      if (this.combo >= 5) this.onFeedback?.('情绪释放！');
      await this.delay(0.24);
      if (this.shouldStopResolving()) {
        this.debug('resolve stopped', 'level ended before collapse/fill');
        return;
      }
      await this.collapseAndFill();
      this.debugCheckBoardIntegrity('after collapse fill');
      if (this.shouldStopResolving()) return;
      groups = this.checker.findMatches(this.grid);
      this.debug('cascade match count', String(groups.length));
    }
  }

  private clearCells(cells: CellState[], combo: number, release: boolean): GoalProgressEvent {
    const event = this.emptyEvent();
    const expanded = this.expandSpecials(cells, event);
    this.uniqueCells(expanded).forEach((cell) => {
      const current = this.grid[cell.row]?.[cell.col];
      if (!current) {
        this.debug('null clear skip', `row=${cell.row} col=${cell.col}`);
        return;
      }
      if (current.fog) event.clearedFog++;
      if (current.cloud) event.clearedClouds++;
      current.fog = false;
      current.cloud = false;
      if (POSITIVE_BLOCKS.includes(current.type)) event.collectedPositive[current.type] = (event.collectedPositive[current.type] ?? 0) + 1;
      else event.clearedBlocks[current.type] = (event.clearedBlocks[current.type] ?? 0) + 1;
      this.nodes[current.row]?.[current.col]?.getComponent(Block)?.playClear();
      this.nodes[current.row][current.col] = null;
      this.grid[current.row][current.col] = null;
    });
    event.unlockedChains += this.obstacles.unlockNear(this.grid, cells);
    event.combo = Math.max(event.combo, combo);
    event.emotionRelease = release ? 1 : 0;
    return event;
  }

  private expandSpecials(cells: CellState[], event: GoalProgressEvent): CellState[] {
    const result = cells.filter(Boolean);
    cells.forEach((cell) => {
      if (!cell) return;
      if (cell.special === SpecialType.Row) {
        event.usedSpecial[SpecialType.Row] = (event.usedSpecial[SpecialType.Row] ?? 0) + 1;
        result.push(...this.grid[cell.row].filter((target): target is CellState => !!target));
        this.onFeedback?.('释放一整排！');
      }
      if (cell.special === SpecialType.Column) {
        event.usedSpecial[SpecialType.Column] = (event.usedSpecial[SpecialType.Column] ?? 0) + 1;
        for (let row = 0; row < this.level.boardHeight; row++) {
          const target = this.grid[row]?.[cell.col];
          if (target) result.push(target);
        }
      }
      if (cell.special === SpecialType.Bomb) {
        event.usedSpecial[SpecialType.Bomb] = (event.usedSpecial[SpecialType.Bomb] ?? 0) + 1;
        for (let r = cell.row - 1; r <= cell.row + 1; r++) {
          for (let c = cell.col - 1; c <= cell.col + 1; c++) {
            const target = this.grid[r]?.[c];
            if (target) result.push(target);
          }
        }
      }
      cell.special = SpecialType.None;
    });
    return result;
  }

  private resolveSpecialSwap(a: CellState, b: CellState): GoalProgressEvent | null {
    if (a.special === SpecialType.Rainbow || b.special === SpecialType.Rainbow) {
      const target = a.special === SpecialType.Rainbow ? b.type : a.type;
      const event = this.clearCells(this.grid.flat().filter((cell): cell is CellState => !!cell && (cell.type === target || cell === a || cell === b)), 1, false);
      event.usedSpecial[SpecialType.Rainbow] = 1;
      return event;
    }
    if (a.special === SpecialType.LuckyStar || b.special === SpecialType.LuckyStar) {
      const target = this.grid.flat().find((cell): cell is CellState => !!cell && (cell.fog || cell.cloud || cell.chained)) ?? this.grid.flat().find((cell): cell is CellState => !!cell);
      if (!target) return null;
      const event = this.clearCells([target], 1, false);
      event.usedSpecial[SpecialType.LuckyStar] = 1;
      return event;
    }
    return null;
  }

  private async collapseAndFill() {
    const oldGrid = this.grid;
    const oldNodes = this.nodes;
    const newGrid: (CellState | null)[][] = Array.from({ length: this.level.boardHeight }, () => Array<CellState | null>(this.level.boardWidth).fill(null));
    const newNodes: (Node | null)[][] = Array.from({ length: this.level.boardHeight }, () => Array<Node | null>(this.level.boardWidth).fill(null));
    const animations: Promise<void>[] = [];

    for (let col = 0; col < this.level.boardWidth; col++) {
      const kept: { cell: CellState; node: Node | null }[] = [];
      for (let row = 0; row < this.level.boardHeight; row++) {
        const cell = oldGrid[row]?.[col];
        if (cell) kept.push({ cell, node: oldNodes[row]?.[col] ?? null });
      }

      for (let row = 0; row < this.level.boardHeight; row++) {
      const existing = kept[row];
      const cell = existing?.cell ?? this.randomCell(row, col);
        cell.row = row;
        cell.col = col;
        newGrid[row][col] = cell;

        const startRow = this.level.boardHeight + row - kept.length + 1;
        const node = existing?.node ?? this.renderCell(cell, this.positionOf(startRow, col));
        newNodes[row][col] = node;
        this.renderObstacleOverlays(node, cell);
        animations.push(this.animateNodeTo(node, this.positionOf(row, col), existing?.node ? 0.2 : 0.24));
      }
    }

    this.grid = newGrid;
    this.nodes = newNodes;
    this.recycleDetachedBlocks();
    await Promise.all(animations);
    this.refreshAllBlockViews();
    this.debugCheckBoardIntegrity('collapseAndFill complete');
  }

  private refreshAllBlockViews() {
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const cell = this.grid[row]?.[col];
        const node = this.nodes[row]?.[col];
        if (!cell || !node) continue;
        node.getComponent(Block)?.setup(cell, this.cellSize - 10);
        this.renderObstacleOverlays(node, cell);
      }
    }
  }

  private hasAnyMove(): boolean {
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell) continue;
        const right = this.grid[row]?.[col + 1];
        const up = this.grid[row + 1]?.[col];
        if (right && this.swapCreatesMatch(cell, right)) return true;
        if (up && this.swapCreatesMatch(cell, up)) return true;
      }
    }
    return false;
  }

  private swapCreatesMatch(a: CellState, b: CellState): boolean {
    this.swapStates(a, b);
    const matched = this.checker.findMatches(this.grid).length > 0;
    this.swapStates(a, b);
    return matched;
  }

  private afterPlayerMove() {
    this.movesSinceCloud++;
    if (this.level.cloudSpreadEvery && this.movesSinceCloud >= this.level.cloudSpreadEvery) {
      this.movesSinceCloud = 0;
      if (this.obstacles.spreadCloud(this.grid)) this.refreshAllBlockViews();
    }
  }

  private createSpecialFromGroups(groups: ReturnType<MatchChecker['findMatches']>): { row: number; col: number; special: SpecialType } | null {
    const cross = groups.find((group) => group.isCross);
    if (cross) return { row: cross.cells[0].row, col: cross.cells[0].col, special: SpecialType.Rainbow };
    const line5 = groups.find((group) => group.isLine5);
    if (line5) return { row: line5.cells[0].row, col: line5.cells[0].col, special: SpecialType.Bomb };
    const line4 = groups.find((group) => group.isLine4);
    if (line4) return { row: line4.cells[0].row, col: line4.cells[0].col, special: line4.horizontal ? SpecialType.Row : SpecialType.Column };
    if (this.combo >= 4 && Math.random() < 0.35) {
      const cell = groups[0].cells[0];
      return { row: cell.row, col: cell.col, special: SpecialType.LuckyStar };
    }
    return null;
  }

  private swapStates(a: CellState, b: CellState) {
    const aRow = a.row;
    const aCol = a.col;
    this.grid[a.row][a.col] = b;
    this.grid[b.row][b.col] = a;
    a.row = b.row;
    a.col = b.col;
    b.row = aRow;
    b.col = aCol;
  }

  private swapNodeRefs(a: CellState, b: CellState, nodeA: Node, nodeB: Node) {
    this.nodes[a.row][a.col] = nodeA;
    this.nodes[b.row][b.col] = nodeB;
  }

  private positionOf(row: number, col: number): Vec3 {
    const width = this.level.boardWidth * this.cellSize;
    const height = this.level.boardHeight * this.cellSize;
    return new Vec3(-width / 2 + this.cellSize / 2 + col * this.cellSize, -height / 2 + this.cellSize / 2 + row * this.cellSize, 0);
  }

  private randomCell(row: number, col: number): CellState {
    return { row, col, type: this.randomType(), special: SpecialType.None, fog: false, chained: false, cloud: false };
  }

  private randomType(): BlockType {
    return this.level.availableBlocks[Math.floor(Math.random() * this.level.availableBlocks.length)];
  }

  private uniqueCells(cells: CellState[]): CellState[] {
    const map = new Map<string, CellState>();
    cells.filter(Boolean).forEach((cell) => map.set(`${cell.row}:${cell.col}`, cell));
    return [...map.values()];
  }

  private emptyEvent(): GoalProgressEvent {
    return { clearedBlocks: {}, collectedPositive: {}, clearedFog: 0, unlockedChains: 0, clearedClouds: 0, usedSpecial: {}, combo: 0, emotionRelease: 0 };
  }

  private countNegative(event: GoalProgressEvent): number {
    return NEGATIVE_BLOCKS.reduce((sum, type) => sum + (event.clearedBlocks[type] ?? 0), 0);
  }

  private isInputLocked(): boolean {
    return this.boardLocked || !this.canAcceptMove();
  }

  private shouldStopResolving(): boolean {
    return !this.canAcceptMove();
  }

  private canAcceptMove(): boolean {
    return this.onCanMove ? this.onCanMove() : true;
  }

  private delay(seconds: number): Promise<void> {
    return new Promise((resolve) => this.scheduleOnce(resolve, seconds));
  }

  private animateNodeTo(node: Node, position: Vec3, duration: number): Promise<void> {
    return new Promise((resolve) => {
      tween(node)
        .to(duration, { position }, { easing: 'quadOut' })
        .call(() => resolve())
        .start();
    });
  }

  private describeCell(cell: CellState): string {
    return `row=${cell.row} col=${cell.col} type=${cell.type}`;
  }

  private describeEvent(event: GoalProgressEvent): string {
    const cleared = Object.entries(event.clearedBlocks).map(([type, count]) => `${type}:${count}`).join(',') || 'none';
    const positive = Object.entries(event.collectedPositive).map(([type, count]) => `${type}:${count}`).join(',') || 'none';
    return `cleared=[${cleared}] positive=[${positive}] fog=${event.clearedFog} chain=${event.unlockedChains} cloud=${event.clearedClouds} combo=${event.combo}`;
  }

  private debug(label: string, value: string) {
    if (DEBUG_MATCH3) console.log(`[Match3][Board] ${label}: ${value}`);
  }

  private debugCheckBoardIntegrity(stage: string) {
    if (!DEBUG_MATCH3) return;
    let emptyCount = 0;
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const block = this.grid[row]?.[col];
        const node = this.nodes[row]?.[col];
        if (!block) {
          emptyCount++;
          console.warn(`[Match3][Integrity][${stage}] Empty cell: row=${row} col=${col}`);
          continue;
        }
        if (block.row !== row || block.col !== col) {
          console.warn(`[Match3][Integrity][${stage}] Block coordinate mismatch: expected=${row},${col} actual=${block.row},${block.col}`);
        }
        if (!block.type) {
          console.warn(`[Match3][Integrity][${stage}] Block type missing: row=${row} col=${col}`);
        }
        if (!node) {
          console.warn(`[Match3][Integrity][${stage}] Block node missing: row=${row} col=${col} type=${block.type}`);
        }
      }
    }
    if (emptyCount === 0) console.log(`[Match3][Integrity][${stage}] board ok`);
  }

  private recycleAllBlocks() {
    [...this.node.children].forEach((child) => this.recycleBlock(child));
  }

  private recycleDetachedBlocks() {
    const live = new Set(this.nodes.flat().filter((node): node is Node => !!node));
    [...this.node.children].forEach((child) => {
      if (!live.has(child)) this.recycleBlock(child);
    });
  }

  private recycleBlock(node: Node | null) {
    if (!node) return;
    tween(node).stop();
    node.off(Node.EventType.TOUCH_END);
    node.off(Node.EventType.TOUCH_START);
    node.off(Node.EventType.TOUCH_MOVE);
    node.off(Node.EventType.TOUCH_CANCEL);
    node.removeFromParent();
    node.active = false;
    this.blockPool.push(node);
  }
}
