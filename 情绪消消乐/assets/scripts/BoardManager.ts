import { _decorator, Color, Component, EventTouch, Graphics, Label, Node, tween, UIOpacity, UITransform, Vec2, Vec3 } from 'cc';
import { Block } from './Block';
import { BlockType, BoardPos, CellState, GoalProgressEvent, LevelConfig, NEGATIVE_BLOCKS, POSITIVE_BLOCKS, SpecialType } from './GameTypes';
import { MatchChecker } from './MatchChecker';
import { ObstacleManager } from './ObstacleManager';

const { ccclass } = _decorator;
const DEBUG_MATCH3 = true;
const MAX_RESOLVE_LOOPS = 20;

function hexColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return new Color(r, g, b, a);
}

type ResolveCallback = (event: GoalProgressEvent, energyPayload: { negative: number; combo: number }) => void;
export type ToolMode = 'star' | 'hammer';

@ccclass('BoardManager')
export class BoardManager extends Component {
  onResolve: ResolveCallback | null = null;
  onMoveConsumed: (() => void) | null = null;
  onCanMove: (() => boolean) | null = null;
  onFeedback: ((text: string) => void) | null = null;
  onToolUsed: ((tool: ToolMode) => void) | null = null;
  onBoardSettled: (() => void) | null = null;

  private level!: LevelConfig;
  private grid: (CellState | null)[][] = [];
  private checker = new MatchChecker();
  private obstacles = new ObstacleManager();
  private selected: CellState | null = null;
  private boardLocked = false;
  private isResolving = false;
  private isGameOver = false;
  private isLevelCompleted = false;
  private cellSize = 72;
  private combo = 0;
  private blockPool: Node[] = [];
  private dragStartCell: CellState | null = null;
  private dragStartPos: Vec2 | null = null;
  private dragResolved = false;
  private toolMode: ToolMode | null = null;

  setup(level: LevelConfig, boardSize: number) {
    this.level = level;
    this.cellSize = Math.floor(boardSize / level.boardWidth);
    console.log('[LevelConfig]', level.level, level.availableBlocks);
    this.validateAvailableBlocks();
    this.recycleAllBlocks();
    this.node.getComponent(UITransform)?.setContentSize(this.cellSize * level.boardWidth, this.cellSize * level.boardHeight);
    this.registerBoardInput();
    this.selected = null;
    this.dragStartCell = null;
    this.dragStartPos = null;
    this.dragResolved = false;
    this.toolMode = null;
    this.boardLocked = false;
    this.isResolving = false;
    this.isGameOver = false;
    this.isLevelCompleted = false;
    this.combo = 0;
    this.checker.runSelfTest();
    this.createGrid();
    this.obstacles.apply(this.grid, level.obstacles);
    this.refreshAllBlockViews();
    this.debugCheckBoardIntegrity('setup');
  }

  lockBoard() {
    this.boardLocked = true;
    this.isGameOver = true;
    this.isLevelCompleted = true;
    this.clearDrag();
    this.selected = null;
  }

  isBusy() {
    return this.boardLocked || this.isResolving;
  }

  setPaused(paused: boolean) {
    if (this.isGameOver || this.isLevelCompleted) return;
    if (!paused) {
      if (!this.isResolving && this.canAcceptMove()) this.boardLocked = false;
      return;
    }
    this.boardLocked = true;
    this.clearDrag();
    this.selected?.node.getComponent(Block)?.setSelected(false);
    this.selected = null;
  }

  setToolMode(mode: ToolMode | null): boolean {
    if (mode && this.isInputLocked()) return false;
    this.toolMode = mode;
    this.clearDrag();
    this.selected?.node.getComponent(Block)?.setSelected(false);
    this.selected = null;
    return true;
  }

  snapshotTypes(): BlockType[][] {
    return this.grid.map((row) => row.map((cell) => cell?.type ?? BlockType.Annoyed));
  }

  snapshotFogMap(): boolean[][] {
    return this.grid.map((row) => row.map((cell) => !!cell?.fog));
  }

  restoreTypes(types: BlockType[][]): boolean {
    if (!types || types.length !== this.level.boardHeight) return false;
    this.recycleAllBlocks();
    this.grid = [];
    for (let row = 0; row < this.level.boardHeight; row++) {
      if (!types[row] || types[row].length !== this.level.boardWidth) return false;
      this.grid[row] = [];
      for (let col = 0; col < this.level.boardWidth; col++) {
        const restoredType = types[row][col] as BlockType | undefined;
        const safeType = restoredType && this.isAllowedCellType(restoredType) ? restoredType : this.randomType();
        this.grid[row][col] = this.createCell(row, col, safeType);
      }
    }
    this.refreshAllBlockViews();
    this.debugCheckBoardIntegrity('restore');
    return true;
  }

  restoreFogMap(fogMap: boolean[][]) {
    this.obstacles.restoreFog(this.grid, fogMap);
    this.refreshAllBlockViews();
  }

  triggerEmotionRelease(): GoalProgressEvent {
    this.debug('energy release', 'random board clear disabled while core board stability is being tested');
    const event = this.emptyEvent();
    event.emotionRelease = 1;
    return event;
  }

  private createGrid() {
    let built = false;

    for (let attempt = 0; attempt < 10; attempt++) {
      this.recycleAllBlocks();
      this.grid = [];
      for (let row = 0; row < this.level.boardHeight; row++) {
        this.grid[row] = [];
        for (let col = 0; col < this.level.boardWidth; col++) {
          this.grid[row][col] = this.createInitialCell(row, col);
        }
      }

      const initialMatches = this.checker.findMatches(this.grid);
      console.log('[InitialMatches]', initialMatches.length);
      this.debugPrintTypeDistribution('InitialBoardTypes');

      if (initialMatches.length === 0 && this.hasAnyMove() && this.hasRequiredTypeSpread()) {
        built = true;
        break;
      }

      console.warn('[InitBoard] Regenerating board', {
        attempt: attempt + 1,
        initialMatches: initialMatches.length,
        hasAnyMove: this.hasAnyMove(),
        hasRequiredTypeSpread: this.hasRequiredTypeSpread(),
      });
    }

    if (!built) {
      console.warn('[InitBoard] Could not satisfy all initial constraints after 10 attempts; repairing with final validation');
      this.repairInitialMatches();
      this.debugPrintTypeDistribution('InitialBoardTypesFinal');
      console.log('[InitialMatches]', this.checker.findMatches(this.grid).length);
    }
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

  private handleTouchStart(cell: CellState, event: EventTouch) {
    if (this.isInputLocked() || cell.chained) return;
    this.dragStartCell = cell;
    this.dragStartPos = event.getUILocation();
    this.dragResolved = false;
    if (!this.selected) cell.node.getComponent(Block)?.setSelected(true);
    this.debug('selected', this.describeCell(cell));
  }

  private handleTouchMove(event: EventTouch) {
    if (this.toolMode || this.isInputLocked() || !this.dragStartCell || !this.dragStartPos || this.dragResolved) return;
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
      this.selected.node.getComponent(Block)?.setSelected(false);
      this.selected = null;
    }
    start.node.getComponent(Block)?.setSelected(false);
    this.dragStartCell = null;
    this.dragStartPos = null;
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
    if (this.toolMode) {
      void this.useToolOnCell(cell);
      return;
    }
    if (this.isInputLocked() || cell.chained) return;
    if (!this.selected) {
      this.selected = cell;
      cell.node.getComponent(Block)?.setSelected(true);
      return;
    }
    const previous = this.selected;
    previous.node.getComponent(Block)?.setSelected(false);
    this.selected = null;
    if (previous.row === cell.row && previous.col === cell.col) return;
    if (Math.abs(previous.row - cell.row) + Math.abs(previous.col - cell.col) !== 1) {
      this.selected = cell;
      cell.node.getComponent(Block)?.setSelected(true);
      return;
    }
    void this.swapAndResolve(previous, cell);
  }

  private clearDrag(clearSelection = true) {
    if (clearSelection && this.dragStartCell) this.dragStartCell.node.getComponent(Block)?.setSelected(false);
    this.dragStartCell = null;
    this.dragStartPos = null;
    this.dragResolved = false;
  }

  private async swapAndResolve(a: CellState, b: CellState) {
    if (this.isInputLocked() || a.chained || b.chained) return;
    this.boardLocked = true;
    this.debug('swap start', `${this.describeCell(a)} <-> ${this.describeCell(b)}`);

    this.swapCells(a, b);
    await Promise.all([
      this.animateNodeTo(a.node, this.positionOf(a.row, a.col), 0.15),
      this.animateNodeTo(b.node, this.positionOf(b.row, b.col), 0.15),
    ]);
    this.debugCheckBoardIntegrity('after swap animation');

    const sunshineCell = a.type === BlockType.Sunshine ? a : b.type === BlockType.Sunshine ? b : null;
    if (sunshineCell) {
      this.onMoveConsumed?.();
      await this.triggerSunshine(sunshineCell);
      return;
    }

    const groups = this.checker.findMatches(this.grid);
    this.debug('match count', String(groups.length));
    if (groups.length === 0) {
      this.swapCells(a, b);
      await Promise.all([
        this.animateNodeTo(a.node, this.positionOf(a.row, a.col), 0.12),
        this.animateNodeTo(b.node, this.positionOf(b.row, b.col), 0.12),
      ]);
      this.debugCheckBoardIntegrity('after swap back');
      this.boardLocked = false;
      return;
    }

    this.onMoveConsumed?.();
    await this.resolveBoard(groups, this.findSunshineSpawn(groups, { row: a.row, col: a.col }));
  }

  private async resolveBoard(initialGroups?: ReturnType<MatchChecker['findMatches']>, initialSunshineSpawn?: BoardPos | null) {
    if (this.isResolving) return;
    this.isResolving = true;
    this.boardLocked = true;
    this.combo = 0;
    let groups = initialGroups ?? this.checker.findMatches(this.grid);
    let sunshineSpawn = initialSunshineSpawn ?? null;
    let loopCount = 0;

    try {
      while (groups.length > 0 && loopCount < MAX_RESOLVE_LOOPS) {
        this.combo++;
        const cells = this.checker.flattenMatches(groups);
        this.debug('resolve groups', groups.map((group) => `${group.type}:${group.cells.length}`).join(', '));
        const event = await this.clearMatches(cells, this.combo, sunshineSpawn);
        sunshineSpawn = null;
        this.onResolve?.(event, { negative: this.countNegative(event), combo: this.combo });
        if (this.combo === 2) this.onFeedback?.('不错！');
        if (this.combo === 3) this.onFeedback?.('好多了！');
        if (this.combo >= 5) this.onFeedback?.('情绪释放！');

        this.debugCheckBoardIntegrity('after clear animations');
        await this.collapseAndFill();
        this.repairEmptyCellsIfNeeded('after collapseAndFill');
        this.debugCheckBoardIntegrity(`after resolve loop ${loopCount}`);
        if (this.isGameOver || this.isLevelCompleted) {
          this.debug('resolve stopped', 'level ended after board was filled');
          break;
        }

        groups = this.checker.findMatches(this.grid);
        loopCount++;
      }

      if (loopCount >= MAX_RESOLVE_LOOPS) console.warn('[Match3] Resolve loop reached safety limit');
    } finally {
      this.isResolving = false;
      this.repairEmptyCellsIfNeeded('before unlock');
      this.debugCheckBoardIntegrity('before unlock');
      if (!this.isGameOver && !this.isLevelCompleted && this.canAcceptMove()) this.boardLocked = false;
      this.onBoardSettled?.();
    }
  }

  private async clearMatches(cells: CellState[], combo: number, sunshineSpawn?: BoardPos | null): Promise<GoalProgressEvent> {
    const event = this.emptyEvent();
    const unique = this.uniqueCells(cells);
    const animations: Promise<void>[] = [];
    const preservedForSunshine = sunshineSpawn ? this.grid[sunshineSpawn.row]?.[sunshineSpawn.col] ?? null : null;

    unique.forEach((cell) => {
      const current = this.grid[cell.row]?.[cell.col];
      if (!current || current !== cell) {
        this.debug('clear skip stale cell', this.describeCell(cell));
        return;
      }

      if (preservedForSunshine && current === preservedForSunshine) {
        if (current.fog) event.clearedFog++;
        if (current.cloud) event.clearedClouds++;
        current.fog = false;
        current.cloud = false;
        if (POSITIVE_BLOCKS.includes(current.type)) event.collectedPositive[current.type] = (event.collectedPositive[current.type] ?? 0) + 1;
        else if (NEGATIVE_BLOCKS.includes(current.type)) event.clearedBlocks[current.type] = (event.clearedBlocks[current.type] ?? 0) + 1;
        return;
      }

      if (current.fog) event.clearedFog++;
      if (current.cloud) event.clearedClouds++;
      current.fog = false;
      current.cloud = false;
      if (POSITIVE_BLOCKS.includes(current.type)) event.collectedPositive[current.type] = (event.collectedPositive[current.type] ?? 0) + 1;
      else if (NEGATIVE_BLOCKS.includes(current.type)) event.clearedBlocks[current.type] = (event.clearedBlocks[current.type] ?? 0) + 1;

      tween(current.node).stop();
      animations.push(current.node.getComponent(Block)!.playClear());
    });

    await Promise.all(animations);

    unique.forEach((cell) => {
      const current = this.grid[cell.row]?.[cell.col];
      if (!current || current !== cell) return;
      if (preservedForSunshine && current === preservedForSunshine) return;
      this.grid[cell.row][cell.col] = null;
      this.recycleBlock(current.node);
    });

    if (preservedForSunshine && this.grid[preservedForSunshine.row]?.[preservedForSunshine.col] === preservedForSunshine) {
      preservedForSunshine.type = BlockType.Sunshine;
      preservedForSunshine.special = SpecialType.None;
      this.setupCellNode(preservedForSunshine);
      await this.animateSunshineCreated(preservedForSunshine.node);
      this.onFeedback?.('治愈阳光');
    }

    event.unlockedChains += this.obstacles.unlockNear(this.grid, unique);
    event.combo = combo;
    return event;
  }

  private async useToolOnCell(cell: CellState) {
    if (!this.toolMode || this.isResolving || this.boardLocked || this.isGameOver || this.isLevelCompleted || !this.canAcceptMove()) return;
    const mode = this.toolMode;
    const current = this.grid[cell.row]?.[cell.col];
    if (!current) return;

    const cells = mode === 'hammer'
      ? [current]
      : this.grid.flat().filter((candidate): candidate is CellState => !!candidate && candidate.type === current.type);
    if (cells.length === 0) return;

    this.boardLocked = true;
    this.toolMode = null;
    this.clearDrag();
    this.selected?.node.getComponent(Block)?.setSelected(false);
    this.selected = null;

    try {
      this.onToolUsed?.(mode);
      const event = await this.clearMatches(cells, 1);
      this.onResolve?.(event, { negative: this.countNegative(event), combo: 1 });
      await this.collapseAndFill();
      this.repairEmptyCellsIfNeeded(`after ${mode}`);
      if (!this.isGameOver && !this.isLevelCompleted && this.canAcceptMove()) await this.resolveBoard();
    } finally {
      if (!this.isGameOver && !this.isLevelCompleted && this.canAcceptMove()) this.boardLocked = false;
    }
  }

  private async triggerSunshine(sunshine: CellState) {
    const current = this.grid[sunshine.row]?.[sunshine.col];
    if (!current || current !== sunshine || current.type !== BlockType.Sunshine) {
      this.boardLocked = false;
      return;
    }

    this.clearDrag();
    this.selected?.node.getComponent(Block)?.setSelected(false);
    this.selected = null;
    this.onFeedback?.('阳光散开');

    try {
      const cells = this.sunshineAreaCells(current);
      const event = await this.clearMatches(cells, 1);
      this.onResolve?.(event, { negative: this.countNegative(event), combo: 1 });
      await this.collapseAndFill();
      this.repairEmptyCellsIfNeeded('after sunshine');
      if (!this.isGameOver && !this.isLevelCompleted && this.canAcceptMove()) await this.resolveBoard();
    } finally {
      if (!this.isGameOver && !this.isLevelCompleted && this.canAcceptMove()) this.boardLocked = false;
    }
  }

  private sunshineAreaCells(center: CellState): CellState[] {
    const cells: CellState[] = [];
    for (let row = center.row - 1; row <= center.row + 1; row++) {
      for (let col = center.col - 1; col <= center.col + 1; col++) {
        if (row < 0 || row >= this.level.boardHeight || col < 0 || col >= this.level.boardWidth) continue;
        const candidate = this.grid[row]?.[col];
        if (!candidate) continue;
        if (candidate.type === BlockType.Sunshine && candidate !== center) continue;
        cells.push(candidate);
      }
    }
    return cells;
  }

  private async collapseAndFill() {
    const animations: Promise<void>[] = [];

    for (let col = 0; col < this.level.boardWidth; col++) {
      const existing: CellState[] = [];

      for (let row = 0; row < this.level.boardHeight; row++) {
        const cell = this.grid[row]?.[col];
        if (cell) existing.push(cell);
        this.grid[row][col] = null;
      }

      let writeRow = 0;
      for (const cell of existing) {
        this.placeCell(cell, writeRow, col);
        animations.push(this.animateNodeTo(cell.node, this.positionOf(writeRow, col), 0.2));
        writeRow++;
      }

      for (let row = writeRow; row < this.level.boardHeight; row++) {
        const cell = this.createRandomCell(row, col);
        cell.node.setPosition(this.spawnPositionOf(row, col));
        this.grid[row][col] = cell;
        animations.push(this.animateNodeTo(cell.node, this.positionOf(row, col), 0.25));
      }
    }

    await Promise.all(animations);
    this.refreshAllBlockViews();
    this.debugCheckBoardIntegrity('after collapseAndFill');
  }

  private createRandomCell(row: number, col: number): CellState {
    return this.createCell(row, col, this.randomType());
  }

  private createInitialCell(row: number, col: number): CellState {
    for (let tries = 0; tries < 20; tries++) {
      const type = this.randomType();
      if (!this.wouldCreateInitialMatch(row, col, type)) return this.createCell(row, col, type);
    }

    const options = this.level.availableBlocks.filter((type) => !this.wouldCreateInitialMatch(row, col, type));
    const type = options.length > 0 ? options[Math.floor(Math.random() * options.length)] : this.randomType();
    return this.createCell(row, col, type);
  }

  private createCell(row: number, col: number, type: BlockType): CellState {
    const node = this.acquireBlockNode();
    const safeType = this.isAllowedCellType(type) ? type : this.randomType();
    const cell: CellState = {
      row,
      col,
      type: safeType,
      special: SpecialType.None,
      fog: false,
      chained: false,
      cloud: false,
      node,
    };
    node.setPosition(this.positionOf(row, col));
    this.setupCellNode(cell);
    return cell;
  }

  private wouldCreateInitialMatch(row: number, col: number, type: BlockType): boolean {
    const horizontal =
      col >= 2 &&
      this.grid[row]?.[col - 1]?.type === type &&
      this.grid[row]?.[col - 2]?.type === type;
    const vertical =
      row >= 2 &&
      this.grid[row - 1]?.[col]?.type === type &&
      this.grid[row - 2]?.[col]?.type === type;
    return horizontal || vertical;
  }

  private acquireBlockNode(): Node {
    const node = this.blockPool.pop() ?? new Node('block');
    node.parent = this.node;
    node.active = true;
    tween(node).stop();
    node.setScale(Vec3.ONE);
    node.angle = 0;
    node.setSiblingIndex(10);
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    opacity.opacity = 255;
    if (!node.getComponent(UITransform)) node.addComponent(UITransform);
    if (!node.getComponent(Block)) node.addComponent(Block);
    return node;
  }

  private setupCellNode(cell: CellState) {
    cell.node.active = true;
    cell.node.setScale(Vec3.ONE);
    cell.node.angle = 0;
    cell.node.getComponent(UIOpacity)!.opacity = 255;
    cell.node.getComponent(Block)!.setup(cell, this.cellSize - 10);
    this.renderObstacleOverlays(cell.node, cell);
  }

  private placeCell(cell: CellState, row: number, col: number) {
    cell.row = row;
    cell.col = col;
    this.grid[row][col] = cell;
  }

  private refreshAllBlockViews() {
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell) continue;
        cell.node.name = `block_${row}_${col}`;
        this.renderObstacleOverlays(cell.node, cell);
      }
    }
  }

  private renderObstacleOverlays(node: Node, cell: CellState) {
    ['fog', 'chain', 'cloud'].forEach((name) => node.getChildByName(name)?.destroy());
    if (cell.fog) this.overlay(node, 'fog', '#34344faa', '');
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

  private hasRequiredTypeSpread(): boolean {
    const required = Math.min(4, this.level.availableBlocks.length);
    const types = new Set<BlockType>();
    this.grid.flat().forEach((cell) => {
      if (cell) types.add(cell.type);
    });
    return types.size >= required;
  }

  private swapCreatesMatch(a: CellState, b: CellState): boolean {
    this.swapCells(a, b);
    const matched = this.checker.findMatches(this.grid).length > 0;
    this.swapCells(a, b);
    return matched;
  }

  private swapCells(a: CellState, b: CellState) {
    const aRow = a.row;
    const aCol = a.col;
    this.grid[a.row][a.col] = b;
    this.grid[b.row][b.col] = a;
    a.row = b.row;
    a.col = b.col;
    b.row = aRow;
    b.col = aCol;
  }

  private randomType(): BlockType {
    const available = this.level.availableBlocks;
    if (!available || available.length === 0) {
      console.error('[LevelConfig] availableBlocks invalid', available);
      return BlockType.Annoyed;
    }
    if (available.length < 3) console.error('[LevelConfig] availableBlocks invalid', available);
    return available[Math.floor(Math.random() * available.length)];
  }

  private isAllowedCellType(type: BlockType): boolean {
    return this.level.availableBlocks.includes(type) || (!!this.level.enableSunshine && type === BlockType.Sunshine);
  }

  private findSunshineSpawn(groups: ReturnType<MatchChecker['findMatches']>, preferred: BoardPos): BoardPos | null {
    if (!this.level.enableSunshine) return null;
    const candidates = groups.filter((group) => group.type !== BlockType.Sunshine && group.cells.length >= 4);
    if (candidates.length === 0) return null;

    const containingPreferred = candidates.find((group) => group.cells.some((cell) => cell.row === preferred.row && cell.col === preferred.col));
    const group = containingPreferred ?? candidates[0];
    const preferredInGroup = group.cells.find((cell) => cell.row === preferred.row && cell.col === preferred.col);
    if (preferredInGroup) return { row: preferredInGroup.row, col: preferredInGroup.col };

    const sorted = [...group.cells].sort((a, b) => {
      const distanceA = Math.abs(a.row - preferred.row) + Math.abs(a.col - preferred.col);
      const distanceB = Math.abs(b.row - preferred.row) + Math.abs(b.col - preferred.col);
      return distanceA - distanceB;
    });
    const closest = sorted[0];
    return closest ? { row: closest.row, col: closest.col } : null;
  }

  private uniqueCells(cells: CellState[]): CellState[] {
    const map = new Map<string, CellState>();
    cells.filter(Boolean).forEach((cell) => map.set(`${cell.row}_${cell.col}`, cell));
    return [...map.values()];
  }

  private emptyEvent(): GoalProgressEvent {
    return { clearedBlocks: {}, collectedPositive: {}, clearedFog: 0, unlockedChains: 0, clearedClouds: 0, usedSpecial: {}, combo: 0, emotionRelease: 0 };
  }

  private countNegative(event: GoalProgressEvent): number {
    return NEGATIVE_BLOCKS.reduce((sum, type) => sum + (event.clearedBlocks[type] ?? 0), 0);
  }

  private isInputLocked(): boolean {
    return this.boardLocked || this.isResolving || this.isGameOver || this.isLevelCompleted || !this.canAcceptMove();
  }

  private canAcceptMove(): boolean {
    return this.onCanMove ? this.onCanMove() : true;
  }

  private positionOf(row: number, col: number): Vec3 {
    const width = this.level.boardWidth * this.cellSize;
    const height = this.level.boardHeight * this.cellSize;
    return new Vec3(-width / 2 + this.cellSize / 2 + col * this.cellSize, -height / 2 + this.cellSize / 2 + row * this.cellSize, 0);
  }

  private spawnPositionOf(row: number, col: number): Vec3 {
    const target = this.positionOf(row, col);
    const boardTop = (this.level.boardHeight * this.cellSize) / 2;
    const spawnY = Math.min(target.y + this.cellSize * 0.85, boardTop + this.cellSize * 0.2);
    return new Vec3(target.x, spawnY, target.z);
  }

  private animateNodeTo(node: Node, position: Vec3, duration: number): Promise<void> {
    tween(node).stop();
    return new Promise((resolve) => {
      tween(node)
        .to(duration, { position }, { easing: 'quadOut' })
        .call(() => resolve())
        .start();
    });
  }

  private animateSunshineCreated(node: Node): Promise<void> {
    tween(node).stop();
    node.setScale(new Vec3(0.5, 0.5, 1));
    return new Promise((resolve) => {
      tween(node)
        .to(0.12, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' })
        .to(0.1, { scale: Vec3.ONE }, { easing: 'quadOut' })
        .call(() => resolve())
        .start();
    });
  }

  private repairEmptyCellsIfNeeded(stage: string) {
    let repaired = 0;
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        if (this.grid[row]?.[col]) continue;
        console.warn(`[BoardRepair] repaired empty cell at ${row},${col} during ${stage}`);
        this.grid[row][col] = this.createRandomCell(row, col);
        repaired++;
      }
    }
    if (repaired > 0) this.debugCheckBoardIntegrity(`after repair ${stage}`);
  }

  private debugCheckBoardIntegrity(stage: string) {
    let emptyCount = 0;
    let missingNodeCount = 0;
    let mismatchCount = 0;
    const nodeSet = new Set<Node>();

    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const cell = this.grid[row]?.[col];
        if (!cell) {
          console.error(`[BoardIntegrity][${stage}] Empty cell at ${row},${col}`);
          emptyCount++;
          continue;
        }
        if (!cell.node) {
          console.error(`[BoardIntegrity][${stage}] Missing node at ${row},${col}`);
          missingNodeCount++;
        }
        if (cell.row !== row || cell.col !== col) {
          console.error(`[BoardIntegrity][${stage}] Coordinate mismatch expected=${row},${col} actual=${cell.row},${cell.col}`);
          mismatchCount++;
        }
        if (cell.node) {
          if (nodeSet.has(cell.node)) console.error(`[BoardIntegrity][${stage}] Duplicate node detected at ${row},${col}`);
          nodeSet.add(cell.node);
        }
        if (!cell.type) console.error(`[BoardIntegrity][${stage}] Missing type at ${row},${col}`);
      }
    }

    console.log(`[BoardIntegrity][${stage}] empty=${emptyCount}, missingNode=${missingNodeCount}, mismatch=${mismatchCount}`);
  }

  private describeCell(cell: CellState): string {
    return `row=${cell.row} col=${cell.col} type=${cell.type}`;
  }

  private debug(label: string, value: string) {
    if (DEBUG_MATCH3) console.log(`[Match3][Board] ${label}: ${value}`);
  }

  private validateAvailableBlocks() {
    if (!this.level.availableBlocks || this.level.availableBlocks.length < 3) {
      console.error('[LevelConfig] availableBlocks invalid', this.level.availableBlocks);
    }
  }

  private debugPrintTypeDistribution(label: string) {
    const countMap: Partial<Record<BlockType, number>> = {};
    let total = 0;
    for (let row = 0; row < this.level.boardHeight; row++) {
      for (let col = 0; col < this.level.boardWidth; col++) {
        const type = this.grid[row]?.[col]?.type;
        if (!type) continue;
        countMap[type] = (countMap[type] ?? 0) + 1;
        total++;
      }
    }

    console.log(`[${label}]`, countMap);
    const maxCount = Math.max(0, ...Object.values(countMap));
    if (total > 0 && maxCount / total > 0.7) console.warn('[InitialBoard] type distribution abnormal', countMap);
  }

  private repairInitialMatches() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const groups = this.checker.findMatches(this.grid);
      if (groups.length === 0) return;
      this.checker.flattenMatches(groups).forEach((cell) => {
        const current = this.grid[cell.row]?.[cell.col];
        if (!current) return;
        current.type = this.randomType();
        this.setupCellNode(current);
      });
    }
  }

  private recycleAllBlocks() {
    [...this.node.children].forEach((child) => this.recycleBlock(child));
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
