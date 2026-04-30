import { _decorator, Component, Node, ResolutionPolicy, UITransform, view } from 'cc';
import { AudioKey } from './AudioKeys';
import { BoardManager, ToolMode } from './BoardManager';
import { EnergyManager } from './EnergyManager';
import { FeedbackManager } from './FeedbackManager';
import { GoalManager } from './GoalManager';
import { BlockType, GoalProgressEvent } from './GameTypes';
import { LevelManager } from './LevelManager';
import { UIManager } from './UIManager';

const { ccclass } = _decorator;
const DEBUG_MATCH3 = false;
const SAVE_KEY = 'emotion_match_save';
const UNLOCKED_KEY = 'emotion_match_unlocked_level';

interface SaveData {
  currentLevel: number;
  stepsLeft: number;
  boardTypes: BlockType[][];
  fogMap: boolean[][];
  starCount: number;
  hammerCount: number;
  energyValue: number;
  goalProgress: number[];
  score: number;
}

@ccclass('GameManager')
export class GameManager extends Component {
  private static booted = false;
  private ui!: UIManager;
  private board!: BoardManager;
  private feedback!: FeedbackManager;
  private levelManager = new LevelManager();
  private goals = new GoalManager();
  private energy = new EnergyManager();
  private movesLeft = 0;
  private score = 0;
  private ended = false;
  private isPaused = false;
  private starCount = 1;
  private hammerCount = 1;
  private activeTool: ToolMode | null = null;

  start() {
    if (GameManager.booted) {
      this.node.active = false;
      return;
    }
    GameManager.booted = true;
    view.setDesignResolutionSize(720, 1280, ResolutionPolicy.SHOW_ALL);
    this.ensureRootSize();
    this.ui = this.node.addComponent(UIManager);
    this.feedback = this.node.addComponent(FeedbackManager);
    this.ui.build();
    this.ui.onStartGame = () => this.startLevel(this.getUnlockedLevel());
    this.ui.onRestartFromFirst = () => this.restartFromFirstLevel();
    this.ui.onContinueGame = () => this.continueSavedGame();
    this.ui.onRetry = () => this.startLevel(this.levelManager.currentNumber);
    this.ui.onNextLevel = () => this.startLevel(this.levelManager.next().level);
    this.ui.onHome = () => {
      this.ui.showHome();
      this.ui.updateHomeSaveState(this.hasSaveData());
    };
    this.ui.onPause = () => this.pauseGame();
    this.ui.onResume = () => this.resumeGame();
    this.ui.onRestart = () => this.restartCurrentLevel();
    this.ui.onPauseHome = () => this.pauseToHome();
    this.ui.onStar = () => this.selectTool('star');
    this.ui.onHammer = () => this.selectTool('hammer');
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.saveCurrentProgress());
    this.ui.showLoading(0.2);
    this.scheduleOnce(() => this.ui.showLoading(0.75), 0.15);
    this.scheduleOnce(() => {
      this.ui.showHome();
      this.ui.updateHomeSaveState(this.hasSaveData());
    }, 0.35);
  }

  private startLevel(levelNumber: number, saveData?: SaveData) {
    const level = this.levelManager.load(levelNumber);
    if (!saveData) localStorage.removeItem(SAVE_KEY);
    this.ended = false;
    this.isPaused = false;
    this.activeTool = null;
    this.score = saveData?.score ?? 0;
    this.movesLeft = saveData?.stepsLeft ?? level.steps;
    this.starCount = saveData?.starCount ?? level.initialTools.star;
    this.hammerCount = saveData?.hammerCount ?? level.initialTools.hammer;
    if (saveData) this.goals.restore(level.goals, saveData.goalProgress);
    else this.goals.reset(level.goals);
    if (saveData) this.energy.restore(level.energyRequired, saveData.energyValue);
    else this.energy.reset(level.energyRequired);
    this.ui.showGame();

    this.board = this.ui.boardHost.getComponent(BoardManager) ?? this.ui.boardHost.addComponent(BoardManager);
    const boardSize = 608;
    this.board.setup(level, boardSize);
    if (saveData?.boardTypes) {
      this.board.restoreTypes(saveData.boardTypes);
      if (saveData.fogMap) this.board.restoreFogMap(saveData.fogMap);
    }
    this.board.onCanMove = () => !this.ended && !this.isPaused && this.movesLeft > 0;
    this.board.onMoveConsumed = () => {
      if (this.ended) return;
      this.movesLeft = Math.max(0, this.movesLeft - 1);
      this.feedback.playAudio(AudioKey.Swap);
      this.refreshHud();
      this.debug(`remaining moves=${this.movesLeft}`);
    };
    this.board.onFeedback = (text) => this.feedback.floatText(text, '#fff3a8', 80);
    this.board.onResolve = (event, energyPayload) => this.applyProgress(event, energyPayload.negative, energyPayload.combo);
    this.board.onToolUsed = (tool) => this.consumeTool(tool);
    this.board.onBoardSettled = () => this.handleBoardSettled();
    this.refreshHud();
    this.showTutorialIfNeeded(level.level, level.name, level.tutorial);
  }

  private applyProgress(event: GoalProgressEvent, clearedNegative: number, combo: number) {
    if (this.ended) return;
    this.score += clearedNegative * 120 + combo * 80 + event.clearedFog * 160 + event.clearedClouds * 180;
    this.goals.apply(event);
    this.feedback.playAudio(combo > 1 ? AudioKey.Combo : AudioKey.Clear);

    if (this.energy.add(clearedNegative, combo)) {
      this.feedback.playAudio(AudioKey.Release);
      this.starCount += 1;
      this.feedback.floatText(`${this.energy.randomLine()} 星星 +1`, '#fff8b6', 140);
      this.goals.apply(this.emotionReleaseEvent());
    }

    this.refreshHud();
    this.debug(`goal progress=${this.goals.describe().join(' | ')} energy=${this.energy.value}/${this.energy.required} combo=${combo}`);
    if (this.goals.isComplete()) this.finish(true);
  }

  private finish(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.board?.lockBoard();
    this.feedback.playAudio(win ? AudioKey.Win : AudioKey.Fail);
    if (win) {
      const nextLevel = Math.min(this.levelManager.currentNumber + 1, this.levelManager.maxNumber);
      localStorage.setItem(UNLOCKED_KEY, String(nextLevel));
      localStorage.removeItem(SAVE_KEY);
      this.ui.updateHomeSaveState(false);
    }
    this.scheduleOnce(() => this.ui.showResult(win, this.score, this.levelManager.currentNumber, this.levelManager.maxNumber), 0.3);
  }

  private refreshHud() {
    this.ui.updateHud(this.levelManager.currentNumber, this.movesLeft, this.goals.describe(), this.energy.percent);
    this.ui.updateTools(this.starCount, this.hammerCount, this.activeTool);
  }

  private selectTool(tool: ToolMode) {
    if (this.ended || this.isPaused) return;
    if (!this.board) return;
    if (this.activeTool === tool) {
      this.activeTool = null;
      this.board.setToolMode(null);
      this.refreshHud();
      return;
    }

    const count = tool === 'star' ? this.starCount : this.hammerCount;
    if (count <= 0) {
      this.feedback.floatText(tool === 'star' ? '星星不足' : '锤子不足', '#fff3a8', 150);
      return;
    }

    if (!this.board.setToolMode(tool)) {
      this.feedback.floatText('请稍等', '#fff3a8', 150);
      return;
    }

    this.activeTool = tool;
    this.feedback.floatText(tool === 'star' ? '请选择一种情绪' : '请选择一个方块', '#fff3a8', 150);
    this.refreshHud();
  }

  private consumeTool(tool: ToolMode) {
    if (tool === 'star') this.starCount = Math.max(0, this.starCount - 1);
    if (tool === 'hammer') this.hammerCount = Math.max(0, this.hammerCount - 1);
    this.activeTool = null;
    this.refreshHud();
  }

  private pauseGame() {
    if (this.ended || this.isPaused) return;
    this.isPaused = true;
    this.activeTool = null;
    this.board?.setToolMode(null);
    this.board?.setPaused(true);
    this.ui.showPause();
    this.refreshHud();
  }

  private resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.ui.hidePopup();
    this.board?.setPaused(false);
  }

  private restartCurrentLevel() {
    this.isPaused = false;
    this.ui.hidePopup();
    this.startLevel(this.levelManager.currentNumber);
  }

  private pauseToHome() {
    this.saveCurrentProgress();
    this.isPaused = false;
    this.ui.hidePopup();
    this.ui.showHome();
    this.ui.updateHomeSaveState(this.hasSaveData());
  }

  private continueSavedGame() {
    const data = this.loadSavedProgress();
    if (!data) {
      this.feedback.floatText('暂无进度', '#fff3a8', 120);
      this.ui.updateHomeSaveState(false);
      return;
    }
    this.startLevel(data.currentLevel, data);
  }

  private restartFromFirstLevel() {
    localStorage.removeItem(SAVE_KEY);
    localStorage.setItem(UNLOCKED_KEY, '1');
    this.isPaused = false;
    this.ended = false;
    this.activeTool = null;
    this.startLevel(1);
  }

  private handleBoardSettled() {
    this.saveCurrentProgress();
    if (!this.ended && this.movesLeft <= 0 && !this.goals.isComplete()) this.finish(false);
  }

  private saveCurrentProgress() {
    if (!this.board || this.ended) return;
    const data: SaveData = {
      currentLevel: this.levelManager.currentNumber,
      stepsLeft: this.movesLeft,
      boardTypes: this.board.snapshotTypes(),
      fogMap: this.board.snapshotFogMap(),
      starCount: this.starCount,
      hammerCount: this.hammerCount,
      energyValue: this.energy.value,
      goalProgress: this.goals.snapshot(),
      score: this.score,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  private loadSavedProgress(): SaveData | null {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SaveData;
    } catch (error) {
      console.warn('[Save] failed to parse saved progress', error);
      localStorage.removeItem(SAVE_KEY);
      return null;
    }
  }

  private hasSaveData(): boolean {
    return !!localStorage.getItem(SAVE_KEY);
  }

  private getUnlockedLevel(): number {
    const saved = Number(localStorage.getItem(UNLOCKED_KEY) ?? '1');
    return Math.max(1, Math.min(this.levelManager.maxNumber, Number.isFinite(saved) ? saved : 1));
  }

  private showTutorialIfNeeded(level: number, name: string, tutorial: string) {
    const key = `tutorial_seen_level_${level}`;
    if (localStorage.getItem(key)) return;
    this.isPaused = true;
    this.board?.setPaused(true);
    this.ui.showTutorial(`第 ${level} 关：${name}`, tutorial, () => {
      localStorage.setItem(key, '1');
      this.ui.hidePopup();
      this.isPaused = false;
      this.board?.setPaused(false);
    });
  }

  private ensureRootSize() {
    if (!this.node.getComponent(UITransform)) this.node.addComponent(UITransform);
    this.node.getComponent(UITransform)!.setContentSize(720, 1280);
    if (!this.node.parent) {
      const root = new Node('RuntimeRoot');
      this.node.parent = root;
    }
  }

  private debug(message: string) {
    if (DEBUG_MATCH3) console.log(`[Match3][Game] ${message}`);
  }

  private emotionReleaseEvent(): GoalProgressEvent {
    return { clearedBlocks: {}, collectedPositive: {}, clearedFog: 0, unlockedChains: 0, clearedClouds: 0, usedSpecial: {}, combo: 0, emotionRelease: 1 };
  }
}
