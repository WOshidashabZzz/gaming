import {
  _decorator,
  AudioClip,
  AudioSource,
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
import { ClassicKnifeSkin } from './SkinConfig';
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
  private _debugTapCount = 0;
  private _debugTapStartedAt = 0;
  private _audioSource: AudioSource | null = null;
  private _soundClips: Partial<Record<'shoot' | 'hit' | 'fail' | 'success' | 'combo', AudioClip>> = {};

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
    if (this.tryHandleDebugCompleteGesture(_event)) {
      return;
    }

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
    this.playSound('shoot');

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
    this.playSound(this._insertedAngles.length > 0 && (this._insertedAngles.length + 1) % 3 === 0 ? 'combo' : 'hit');

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
    this.playSound('success');
    const hasNext = LevelConfig.hasLevel(this._currentLevelIndex + 1);
    if (hasNext) {
      this.uiManager.setWinPanelContent('通关成功', '下一关', true);
    } else {
      this.uiManager.setWinPanelContent('恭喜你顺利通关！', '重新开始', true);
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
    this.playSound('fail');
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
      this.launchPoint = found ?? this.createNode('LaunchPoint', this.node, new Vec3(0, -size.height * 0.32, 0));
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

    resources.load(ClassicKnifeSkin.backgroundSprite, SpriteFrame, (err, sf) => {
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

    // 投掷位木托
    g.fillColor = new Color(0, 0, 0, 70);
    g.roundRect(-42, -54, 84, 30, 12);
    g.fill();

    g.fillColor = new Color(95, 58, 34, 255);
    g.roundRect(-38, -50, 76, 26, 11);
    g.fill();

    g.strokeColor = new Color(224, 152, 82, 185);
    g.lineWidth = 2;
    g.moveTo(-28, -38);
    g.lineTo(28, -38);
    g.stroke();

    // 待发飞刀
    g.fillColor = new Color(63, 66, 70, 255);
    g.moveTo(0, 36);
    g.lineTo(-12, 4);
    g.lineTo(-7, -16);
    g.lineTo(7, -16);
    g.lineTo(12, 4);
    g.close();
    g.fill();

    g.fillColor = new Color(232, 238, 240, 255);
    g.moveTo(0, 40);
    g.lineTo(-9, 3);
    g.lineTo(-5, -12);
    g.lineTo(5, -12);
    g.lineTo(9, 3);
    g.close();
    g.fill();

    g.fillColor = new Color(255, 255, 255, 120);
    g.moveTo(0, 32);
    g.lineTo(-2, -8);
    g.lineTo(5, -8);
    g.lineTo(8, 4);
    g.close();
    g.fill();

    g.fillColor = new Color(80, 48, 30, 255);
    g.roundRect(-8, -18, 16, 52, 5);
    g.fill();

    g.strokeColor = new Color(174, 106, 52, 210);
    g.lineWidth = 2.2;
    for (let y = -8; y <= 22; y += 10) {
      g.moveTo(-7, y);
      g.lineTo(7, y + 7);
      g.stroke();
    }

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
    this.uiManager.setWinPanelContent('恭喜你顺利通关！', '重新开始', true);
    this.uiManager.showWinPanel();
  }

  private tryHandleDebugCompleteGesture(event: EventTouch): boolean {
    if (!this._bootReady || !this.uiManager) {
      return false;
    }

    const ui = this.node.getComponent(UITransform);
    if (!ui) {
      return false;
    }

    const touch = event.getUILocation();
    const topY = ui.height - 260;
    const inDebugHotspot = touch.x <= 220 && touch.y >= topY;
    if (!inDebugHotspot) {
      return false;
    }

    const now = director.getTotalTime() / 1000;
    if (now - this._debugTapStartedAt > 2) {
      this._debugTapStartedAt = now;
      this._debugTapCount = 0;
    }

    this._debugTapCount += 1;
    if (this._debugTapCount >= 5) {
      this._debugTapCount = 0;
      this.enterGameCompleted();
      return true;
    }

    return true;
  }

  private async preloadCriticalAssets(): Promise<void> {
    if (!this.uiManager) {
      return;
    }

    await this.preloadDir('bg', 0, 0.75);
    await this.preloadSounds();

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

  private preloadSounds(): Promise<void> {
    this._audioSource = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource);
    const soundEntries: Array<[keyof GameManager['_soundClips'], string]> = [
      ['shoot', ClassicKnifeSkin.shootSound],
      ['hit', ClassicKnifeSkin.hitSound],
      ['fail', ClassicKnifeSkin.failSound],
      ['success', ClassicKnifeSkin.successSound],
      ['combo', ClassicKnifeSkin.comboSound],
    ];

    return Promise.all(
      soundEntries.map(
        ([key, path]) =>
          new Promise<void>((resolve) => {
            resources.load(path, AudioClip, (err, clip) => {
              if (!err && clip) {
                this._soundClips[key] = clip;
              }
              resolve();
            });
          }),
      ),
    ).then(() => undefined);
  }

  private playSound(name: keyof GameManager['_soundClips']): void {
    const clip = this._soundClips[name];
    if (!clip || !this._audioSource) {
      return;
    }

    this._audioSource.playOneShot(clip, name === 'fail' ? 0.45 : 0.35);
  }
}
