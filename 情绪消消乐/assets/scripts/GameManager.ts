import { _decorator, Component, Node, ResolutionPolicy, UITransform, view } from 'cc';
import { AudioKey } from './AudioKeys';
import { BoardManager } from './BoardManager';
import { EnergyManager } from './EnergyManager';
import { FeedbackManager } from './FeedbackManager';
import { GoalManager } from './GoalManager';
import { GoalProgressEvent } from './GameTypes';
import { LevelManager } from './LevelManager';
import { UIManager } from './UIManager';

const { ccclass } = _decorator;
const DEBUG_MATCH3 = false;

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
    this.ui.onStartGame = () => this.startLevel(this.levelManager.currentNumber);
    this.ui.onRetry = () => this.startLevel(this.levelManager.currentNumber);
    this.ui.onNextLevel = () => this.startLevel(this.levelManager.next().level);
    this.ui.onHome = () => this.ui.showHome();
    this.ui.showLoading(0.2);
    this.scheduleOnce(() => this.ui.showLoading(0.75), 0.15);
    this.scheduleOnce(() => this.ui.showHome(), 0.35);
  }

  private startLevel(levelNumber: number) {
    const level = this.levelManager.load(levelNumber);
    this.ended = false;
    this.score = 0;
    this.movesLeft = level.moves;
    this.goals.reset(level.goals);
    this.energy.reset(level.energyRequired);
    this.ui.showGame();

    this.board = this.ui.boardHost.getComponent(BoardManager) ?? this.ui.boardHost.addComponent(BoardManager);
    const boardSize = 608;
    this.board.setup(level, boardSize);
    this.board.onCanMove = () => !this.ended && this.movesLeft > 0;
    this.board.onMoveConsumed = () => {
      if (this.ended) return;
      this.movesLeft = Math.max(0, this.movesLeft - 1);
      this.feedback.playAudio(AudioKey.Swap);
      this.refreshHud();
      this.debug(`remaining moves=${this.movesLeft}`);
    };
    this.board.onFeedback = (text) => this.feedback.floatText(text, '#fff3a8', 80);
    this.board.onResolve = (event, energyPayload) => this.applyProgress(event, energyPayload.negative, energyPayload.combo);
    this.refreshHud();
  }

  private applyProgress(event: GoalProgressEvent, clearedNegative: number, combo: number) {
    if (this.ended) return;
    this.score += clearedNegative * 120 + combo * 80 + event.clearedFog * 160 + event.clearedClouds * 180;
    this.goals.apply(event);
    this.feedback.playAudio(combo > 1 ? AudioKey.Combo : AudioKey.Clear);

    if (this.energy.add(clearedNegative, combo)) {
      this.feedback.playAudio(AudioKey.Release);
      this.feedback.floatText(this.energy.randomLine(), '#fff8b6', 140);
      this.goals.apply(this.emotionReleaseEvent());
    }

    this.refreshHud();
    this.debug(`goal progress=${this.goals.describe().join(' | ')} energy=${this.energy.value}/${this.energy.required} combo=${combo}`);
    if (this.goals.isComplete()) this.finish(true);
    else if (this.movesLeft <= 0) this.finish(false);
  }

  private finish(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.board?.lockBoard();
    this.feedback.playAudio(win ? AudioKey.Win : AudioKey.Fail);
    this.scheduleOnce(() => this.ui.showResult(win, this.score, this.levelManager.currentNumber), 0.3);
  }

  private refreshHud() {
    this.ui.updateHud(this.levelManager.currentNumber, this.movesLeft, this.goals.describe(), this.energy.percent);
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
