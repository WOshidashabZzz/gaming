import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  Input,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UITransform,
  Vec3,
  Widget,
  director,
  input,
  instantiate,
  resources,
  tween,
  view,
} from 'cc';
import { GameState } from './GameTypes';
import { Knife } from './Knife';
import { LevelConfig } from './LevelConfig';
import { Turntable } from './Turntable';
import { UIManager } from './UIManager';

const { ccclass, property } = _decorator;

@ccclass('GameManager')
export class GameManager extends Component {
  @property(Turntable)
  public turntable: Turntable | null = null;

  @property(UIManager)
  public uiManager: UIManager | null = null;

  @property(Node)
  public knifePrefab: Node | null = null;

  @property(Node)
  public launchPoint: Node | null = null;

  @property(Node)
  public knifeFlyLayer: Node | null = null;

  @property({ tooltip: '最短发射间隔（秒）' })
  public minShootInterval = 0.12;

  @property({ tooltip: '角度差小于该阈值时判定碰撞失败（单位：度）' })
  public collisionAngleThreshold = 16;

  private _state: GameState = GameState.WaitingStart;
  private _remainingKnives = 0;
  private _currentLevelIndex = 0;
  private _insertedAngles: number[] = [];
  private _flyingKnife: Knife | null = null;
  private _attachedKnifeNodes: Node[] = [];
  private _launchMarker: Node | null = null;
  private _lastShootAt = -99;
  private _reverseInterval = 0;
  private _reverseElapsed = 0;
  private _bootReady = false;

  protected onLoad(): void {
    this.ensureRuntimeNodes();
    this.uiManager?.init(this.onStartLevel.bind(this), this.onRestartLevel.bind(this), this.onNextLevel.bind(this));
    input.on(Input.EventType.TOUCH_START, this.onTouchStart, this);

    this._state = GameState.Loading;
    this.uiManager?.showLoading(0);
    void this.preloadCriticalAssets();
  }

  protected start(): void {
    // 启动流程在 preloadCriticalAssets 完成后进入首关
  }

  protected onDestroy(): void {
    input.off(Input.EventType.TOUCH_START, this.onTouchStart, this);
  }

  protected update(dt: number): void {
    if (this._state !== GameState.Playing || this._reverseInterval <= 0 || !this.turntable) {
      return;
    }

    this._reverseElapsed += dt;
    while (this._reverseElapsed >= this._reverseInterval) {
      this._reverseElapsed -= this._reverseInterval;
      this.turntable.reverseDirection();
    }
  }

  private loadLevel(levelIndex: number, showStartPanel: boolean): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    if (!LevelConfig.hasLevel(levelIndex)) {
      this.enterGameCompleted();
      return;
    }

    this.clearAllKnives();

    this._state = GameState.WaitingStart;
    this._currentLevelIndex = levelIndex;
    this._insertedAngles.length = 0;
    this._flyingKnife = null;

    const levelData = LevelConfig.getLevel(this._currentLevelIndex);
    if (!levelData) {
      this.enterGameCompleted();
      return;
    }
    this._remainingKnives = levelData.knives;
    this._reverseInterval = levelData.reverseInterval ?? 0;
    this._reverseElapsed = 0;

    this.turntable.resetTurntable();
    this.turntable.applyLevel(levelData.speed, levelData.dir);
    this.turntable.setRotateEnabled(false);
    this.spawnInitialKnives(levelData.initialKnifeAngles ?? []);

    this.uiManager.setLevel(this._currentLevelIndex + 1);
    this.uiManager.setRemaining(this._remainingKnives);

    if (showStartPanel) {
      this.uiManager.showStartPanel();
      this._state = GameState.WaitingStart;
    } else {
      this._state = GameState.Playing;
      this._lastShootAt = -99;
      this._reverseElapsed = 0;
      this.turntable.setRotateEnabled(true);
      this.uiManager.showPlayingHUD();
    }
  }

  private onStartLevel(): void {
    if (!this._bootReady) {
      return;
    }

    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Playing;
    this._lastShootAt = -99;
    this._reverseElapsed = 0;
    this.turntable.setRotateEnabled(true);
    this.uiManager.showPlayingHUD();
  }

  private onRestartLevel(): void {
    this.loadLevel(this._currentLevelIndex, true);
  }

  private onNextLevel(): void {
    const nextIndex = this._currentLevelIndex + 1;
    if (!LevelConfig.hasLevel(nextIndex)) {
      this.loadLevel(0, true);
      return;
    }
    this.loadLevel(nextIndex, false);
  }

  private onTouchStart(_event: EventTouch): void {
    if (this._state !== GameState.Playing) {
      return;
    }

    if (this._flyingKnife || this._remainingKnives <= 0) {
      return;
    }

    const now = director.getTotalTime() / 1000;
    if (now - this._lastShootAt < this.minShootInterval) {
      return;
    }
    this._lastShootAt = now;

    this.fireKnife();
  }

  private fireKnife(): void {
    if (!this.launchPoint || !this.turntable || !this.knifeFlyLayer || !this.uiManager) {
      return;
    }

    this.playLaunchMarkerFeedback();

    const knifeNode = this.knifePrefab ? instantiate(this.knifePrefab) : this.createRuntimeKnifeNode();
    this.knifeFlyLayer.addChild(knifeNode);

    const knife = knifeNode.getComponent(Knife) ?? knifeNode.addComponent(Knife);
    this._flyingKnife = knife;

    this._remainingKnives -= 1;
    this.uiManager.setRemaining(this._remainingKnives);

    const startWorld = this.launchPoint.worldPosition.clone();
    const turntableWorld = this.turntable.node.worldPosition;
    const hitY = turntableWorld.y - this.turntable.radius;

    knife.onReachTarget = this.onKnifeReachTarget.bind(this);
    knife.launch(startWorld, hitY);
  }

  private onKnifeReachTarget(knife: Knife): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    const hitWorldPos = knife.node.worldPosition.clone();
    const hitAngle = this.calcHitAngleInTurntableLocal(hitWorldPos);

    if (this.isAngleColliding(hitAngle)) {
      this.handleLose(knife);
      return;
    }

    knife.attachToTurntable(this.turntable.node, hitAngle, this.turntable.radius);
    this.turntable.playHitFeedback();

    this._attachedKnifeNodes.push(knife.node);
    this._insertedAngles.push(hitAngle);
    this._flyingKnife = null;

    if (this._remainingKnives <= 0) {
      this.handleWin();
    }
  }

  private handleWin(): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Win;
    this.turntable.setRotateEnabled(false);
    const hasNext = LevelConfig.hasLevel(this._currentLevelIndex + 1);
    if (hasNext) {
      this.uiManager.setWinPanelContent('通关成功', '下一关', true);
    } else {
      this.uiManager.setWinPanelContent('全部关卡完成', '重新开始', true);
    }
    this.uiManager.showWinPanel();
  }

  private handleLose(knife: Knife): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Lose;
    this._flyingKnife = null;

    knife.playFailDrop();
    this.turntable.setRotateEnabled(false);
    this.uiManager.showLosePanel();
  }

  private clearAllKnives(): void {
    if (this._flyingKnife) {
      this._flyingKnife.node.destroy();
      this._flyingKnife = null;
    }

    if (this.knifeFlyLayer) {
      for (const node of this.knifeFlyLayer.children) {
        if (node?.isValid) {
          node.destroy();
        }
      }
    }

    for (const knifeNode of this._attachedKnifeNodes) {
      if (knifeNode?.isValid) {
        knifeNode.destroy();
      }
    }

    this._attachedKnifeNodes.length = 0;
  }

  private calcHitAngleInTurntableLocal(hitWorldPos: Vec3): number {
    if (!this.turntable) {
      return 0;
    }

    const local = new Vec3();
    this.turntable.node.inverseTransformPoint(local, hitWorldPos);

    const deg = (Math.atan2(local.y, local.x) * 180) / Math.PI;
    return this.normalizeAngle(deg);
  }

  private isAngleColliding(hitAngle: number): boolean {
    for (const angle of this._insertedAngles) {
      const diff = this.minAngleDiff(hitAngle, angle);
      if (diff < this.collisionAngleThreshold) {
        return true;
      }
    }

    return false;
  }

  private minAngleDiff(a: number, b: number): number {
    let diff = Math.abs(a - b) % 360;
    if (diff > 180) {
      diff = 360 - diff;
    }
    return diff;
  }

  private normalizeAngle(deg: number): number {
    let out = deg % 360;
    if (out < 0) {
      out += 360;
    }
    return out;
  }

  private ensureRuntimeNodes(): void {
    const size = this.getVisibleSize();

    const rootUi = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    rootUi.setContentSize(size.width, size.height);

    this.turntable = this.turntable ?? this.ensureTurntable();
    this.ensureGameBackground();

    if (!this.knifeFlyLayer) {
      const found = this.node.getChildByName('KnifeFlyLayer');
      this.knifeFlyLayer = found ?? this.createNode('KnifeFlyLayer', this.node, new Vec3(0, 0, 0));
    }

    if (!this.launchPoint) {
      const found = this.node.getChildByName('LaunchPoint');
      this.launchPoint = found ?? this.createNode('LaunchPoint', this.node, new Vec3(0, -size.height * 0.36, 0));
    }

    this.ensureLaunchMarker();

    let uiNode = this.node.getChildByName('UIRoot');
    if (!uiNode) {
      uiNode = this.createNode('UIRoot', this.node, new Vec3(0, 0, 0));
    }

    const ui = uiNode.getComponent(UITransform) ?? uiNode.addComponent(UITransform);
    ui.setContentSize(size.width, size.height);

    const widget = uiNode.getComponent(Widget) ?? uiNode.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;

    if (!this.uiManager) {
      this.uiManager = uiNode.getComponent(UIManager) ?? uiNode.addComponent(UIManager);
    }
  }

  private ensureTurntable(): Turntable {
    let turnNode = this.node.getChildByName('Turntable');
    if (!turnNode) {
      turnNode = this.createNode('Turntable', this.node, new Vec3(0, 120, 0));
    }

    if (!turnNode.getComponent(UITransform)) {
      const ui = turnNode.addComponent(UITransform);
      ui.setContentSize(300, 300);
    }

    return turnNode.getComponent(Turntable) ?? turnNode.addComponent(Turntable);
  }

  private ensureGameBackground(): void {
    const size = this.getVisibleSize();

    let bg = this.node.getChildByName('GameBackground');
    if (!bg) {
      bg = new Node('GameBackground');
      this.node.addChild(bg);
      bg.setSiblingIndex(0);
    }

    const ui = bg.getComponent(UITransform) ?? bg.addComponent(UITransform);
    ui.setContentSize(size.width, size.height);

    const widget = bg.getComponent(Widget) ?? bg.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;

    const sp = bg.getComponent(Sprite) ?? bg.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = new Color(255, 255, 255, 255);

    resources.load('bg/bg_game_small/spriteFrame', SpriteFrame, (err, sf) => {
      if (err || !sf || !sp.isValid) {
        return;
      }
      sp.spriteFrame = sf;
    });
  }

  private getVisibleSize(): { width: number; height: number } {
    const s = view.getVisibleSize();
    return { width: s.width, height: s.height };
  }

  private createRuntimeKnifeNode(): Node {
    const node = new Node('KnifeRuntime');
    if (!node.getComponent(UITransform)) {
      const ui = node.addComponent(UITransform);
      ui.setContentSize(20, 110);
    }
    node.addComponent(Knife);
    return node;
  }

  private spawnInitialKnives(angles: number[]): void {
    if (!this.turntable || angles.length === 0) {
      return;
    }

    for (const rawAngle of angles) {
      const angle = this.normalizeAngle(rawAngle);
      const knifeNode = this.knifePrefab ? instantiate(this.knifePrefab) : this.createRuntimeKnifeNode();
      const knife = knifeNode.getComponent(Knife) ?? knifeNode.addComponent(Knife);

      knife.node.setParent(this.turntable.node);
      const rad = (angle * Math.PI) / 180;
      knife.node.setPosition(Math.cos(rad) * this.turntable.radius, Math.sin(rad) * this.turntable.radius, 0);
      knife.node.angle = angle + 90;

      this._attachedKnifeNodes.push(knife.node);
      this._insertedAngles.push(angle);
    }
  }

  private createNode(name: string, parent: Node, pos: Vec3): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.setPosition(pos);
    return node;
  }

  private ensureLaunchMarker(): void {
    if (!this.launchPoint) {
      return;
    }

    let marker = this.node.getChildByName('LaunchMarker');
    if (!marker) {
      marker = this.createNode('LaunchMarker', this.node, this.launchPoint.position.clone());
    } else {
      marker.setPosition(this.launchPoint.position);
    }

    const ui = marker.getComponent(UITransform) ?? marker.addComponent(UITransform);
    ui.setContentSize(188, 188);

    const g = marker.getComponent(Graphics) ?? marker.addComponent(Graphics);
    g.clear();

    // 弩臂阴影
    g.lineWidth = 8;
    g.strokeColor = new Color(0, 0, 0, 65);
    g.moveTo(-46, -12);
    g.quadraticCurveTo(0, 34, 46, -12);
    g.stroke();

    // 弩臂主体
    g.lineWidth = 7;
    g.strokeColor = new Color(154, 98, 56, 255);
    g.moveTo(-44, -11);
    g.quadraticCurveTo(0, 33, 44, -11);
    g.stroke();

    // 弩臂高光
    g.lineWidth = 2.2;
    g.strokeColor = new Color(213, 165, 113, 215);
    g.moveTo(-38, -9);
    g.quadraticCurveTo(0, 26, 38, -9);
    g.stroke();

    // 弓弦
    g.lineWidth = 2.1;
    g.strokeColor = new Color(230, 230, 230, 220);
    g.moveTo(-39, -4);
    g.lineTo(0, 18);
    g.lineTo(39, -4);
    g.stroke();

    // 弩身阴影
    g.fillColor = new Color(0, 0, 0, 72);
    g.roundRect(-13, -44, 26, 57, 7);
    g.fill();

    // 弩身主体
    g.fillColor = new Color(90, 70, 50, 255);
    g.roundRect(-11, -42, 22, 54, 7);
    g.fill();

    // 弩身高光
    g.fillColor = new Color(145, 115, 84, 145);
    g.roundRect(-8.5, -35, 6.2, 38, 3);
    g.fill();

    // 箭槽
    g.fillColor = new Color(220, 210, 180, 255);
    g.roundRect(-3, -13, 6, 34, 2);
    g.fill();

    // 箭头
    g.fillColor = new Color(230, 235, 245, 255);
    g.moveTo(0, 32);
    g.lineTo(-8, 20);
    g.lineTo(8, 20);
    g.close();
    g.fill();

    // 箭头高光
    g.fillColor = new Color(255, 255, 255, 125);
    g.moveTo(0, 28);
    g.lineTo(-2.2, 23);
    g.lineTo(2.2, 23);
    g.close();
    g.fill();

    // 底部节点
    g.fillColor = new Color(255, 230, 120, 230);
    g.circle(0, -48, 8);
    g.fill();

    this._launchMarker = marker;
  }

  private playLaunchMarkerFeedback(): void {
    if (!this._launchMarker) {
      return;
    }

    Tween.stopAllByTarget(this._launchMarker);
    this._launchMarker.setScale(1, 1, 1);

    tween(this._launchMarker)
      .to(0.06, { scale: new Vec3(1.24, 1.24, 1) })
      .to(0.08, { scale: new Vec3(1, 1, 1) })
      .start();
  }

  private enterGameCompleted(): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this.clearAllKnives();
    this._state = GameState.Win;
    this.turntable.setRotateEnabled(false);
    this.uiManager.setLevel(LevelConfig.totalLevels());
    this.uiManager.setRemaining(0);
    this.uiManager.setWinPanelContent('全部关卡完成', '重新开始', true);
    this.uiManager.showWinPanel();
  }

  private async preloadCriticalAssets(): Promise<void> {
    if (!this.uiManager) {
      return;
    }

    await this.preloadDir('bg', 0, 0.7);
    await this.preloadDir('branding', 0.7, 0.3);

    this.uiManager.showLoading(1);
    this._bootReady = true;
    this.loadLevel(this._currentLevelIndex, true);
  }

  private preloadDir(path: string, start: number, weight: number): Promise<void> {
    return new Promise((resolve) => {
      resources.loadDir(
        path,
        (_finished: number, total: number) => {
          const t = total > 0 ? _finished / total : 1;
          this.uiManager?.showLoading(start + t * weight);
        },
        () => {
          this.uiManager?.showLoading(start + weight);
          resolve();
        },
      );
    });
  }
}
