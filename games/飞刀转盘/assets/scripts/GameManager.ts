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
  UIOpacity,
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
import { WesternSkin } from './SkinConfig';
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

  @property({ tooltip: '角度差小于该阈值时显示危险提示（单位：度）' })
  public dangerAngleThreshold = 15;

  @property({ tooltip: '动态转速最低值' })
  public minSpeed = 140;

  @property({ tooltip: '动态转速最高值' })
  public maxSpeed = 180;

  public comboCount = 0;

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
  private _reverseIntervalRange: [number, number] | null = null;
  private _reverseWarnDuration = 0.5;
  private _reverseWarningActive = false;
  private _timeScaleEffects = new Map<string, number>();
  private _timeScaleTokens = new Map<string, number>();
  private _bootReady = false;
  private _debugTapCount = 0;
  private _debugTapStartedAt = 0;

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
    this.unschedule(this.finishReverseWarning);
    this.clearTimeScaleEffects();
  }

  protected update(dt: number): void {
    if (this._state !== GameState.Playing || !this.turntable) {
      return;
    }

    const scaledDt = dt * this.getFallbackTimeScale();
    this.updateDangerWarnings();
    this.updateReverseTimer(scaledDt);
  }

  private updateReverseTimer(dt: number): void {
    if (this._reverseInterval <= 0 || !this.turntable || this._reverseWarningActive) {
      return;
    }

    this._reverseElapsed += dt;
    if (this._reverseElapsed >= this._reverseInterval) {
      this.startReverseWarning();
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
    this.comboCount = 0;
    this._reverseWarningActive = false;
    this.unschedule(this.finishReverseWarning);
    this.clearTimeScaleEffects();

    const levelData = LevelConfig.getLevel(this._currentLevelIndex);
    if (!levelData) {
      this.enterGameCompleted();
      return;
    }
    this._remainingKnives = levelData.knives;
    this._reverseIntervalRange = levelData.reverseIntervalRange ?? null;
    this._reverseInterval = this.pickReverseInterval(levelData.reverseInterval ?? 0, this._reverseIntervalRange);
    this._reverseWarnDuration = levelData.reverseWarnDuration ?? 0.5;
    this._reverseElapsed = 0;

    this.turntable.resetTurntable();
    this.turntable.applyLevel(levelData.speed, levelData.dir);
    this.turntable.setSpeedPulse(levelData.speedPulse?.min ?? this.minSpeed, levelData.speedPulse?.max ?? this.maxSpeed, levelData.speedPulse?.period ?? 5);
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
      this.handleLose(knife, hitWorldPos);
      return;
    }

    knife.attachToTurntable(this.turntable.node, hitAngle, this.turntable.radius);
    this.handleSuccessfulHit();

    this._attachedKnifeNodes.push(knife.node);
    this._insertedAngles.push(hitAngle);
    this._flyingKnife = null;
    this.updateDangerWarnings();

    if (this._remainingKnives <= 0) {
      this.handleWin();
    }
  }

  private handleWin(): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Win;
    this._reverseWarningActive = false;
    this.unschedule(this.finishReverseWarning);
    this.turntable.setRotateEnabled(false);
    const hasNext = LevelConfig.hasLevel(this._currentLevelIndex + 1);
    if (hasNext) {
      this.uiManager.setWinPanelContent('完美命中！', '下一关', true);
    } else {
      this.uiManager.setWinPanelContent('完美命中！', '再来一把', true);
    }
    this.uiManager.showWinPanel();
  }

  private handleSuccessfulHit(): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this.comboCount += 1;
    this.uiManager.showCombo(this.comboCount);
    this.turntable.playHitFeedback();
    this.pushTimeScaleEffect('hitStop', 0, 0.08);
    this.playSfx('hit');
    this.handleComboMilestone();
  }

  private handleComboMilestone(): void {
    if (!this.turntable) {
      return;
    }

    if (this.comboCount === 3) {
      this.turntable.playComboPulse();
      this.playSfx('combo');
    }

    if (this.comboCount === 5) {
      this.pushTimeScaleEffect('comboSlow', 0.8, 0.2);
      this.shakeScreen(5, 0.2);
      this.playLightVibration();
    }

    if (this.comboCount >= 8) {
      this.turntable.playComboGlow(1);
    }
  }

  private handleLose(knife: Knife, hitWorldPos: Vec3): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Lose;
    this._flyingKnife = null;
    this.comboCount = 0;
    this._reverseWarningActive = false;
    this.unschedule(this.finishReverseWarning);

    this.pushTimeScaleEffect('failStop', 0, 0.1);
    this.shakeScreen(9, 0.26);
    this.spawnImpactFlash(hitWorldPos);
    this.playSfx('fail');
    this.playLightVibration();
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

  private updateDangerWarnings(): void {
    const dangerFlags = new Array<boolean>(this._attachedKnifeNodes.length).fill(false);

    for (let i = 0; i < this._insertedAngles.length; i += 1) {
      for (let j = i + 1; j < this._insertedAngles.length; j += 1) {
        if (this.minAngleDiff(this._insertedAngles[i], this._insertedAngles[j]) < this.dangerAngleThreshold) {
          dangerFlags[i] = true;
          dangerFlags[j] = true;
        }
      }
    }

    for (let i = 0; i < this._attachedKnifeNodes.length; i += 1) {
      const knife = this._attachedKnifeNodes[i]?.getComponent(Knife);
      knife?.setDangerWarning(Boolean(dangerFlags[i]));
    }
  }

  private startReverseWarning(): void {
    if (!this.turntable) {
      return;
    }

    this._reverseWarningActive = true;
    this._reverseElapsed = 0;
    this.turntable.playReverseWarning(this._reverseWarnDuration);
    this.scheduleOnce(this.finishReverseWarning, this._reverseWarnDuration);
  }

  private finishReverseWarning(): void {
    if (this._state !== GameState.Playing || !this.turntable) {
      this._reverseWarningActive = false;
      return;
    }

    this.turntable.reverseDirection();
    this._reverseWarningActive = false;
    this._reverseElapsed = 0;
    this._reverseInterval = this.pickReverseInterval(this._reverseInterval, this._reverseIntervalRange);
  }

  private pickReverseInterval(fallback: number, range: [number, number] | null): number {
    if (!range) {
      return fallback;
    }

    const min = Math.min(range[0], range[1]);
    const max = Math.max(range[0], range[1]);
    return min + Math.random() * (max - min);
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

    resources.load(WesternSkin.backgroundSprite, SpriteFrame, (err, sf) => {
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

    // 西部飞刀发射器兜底图形；贴图加载成功后会清掉它。
    g.fillColor = new Color(0, 0, 0, 72);
    g.roundRect(-54, -58, 108, 36, 12);
    g.fill();

    g.fillColor = new Color(104, 62, 35, 255);
    g.roundRect(-50, -54, 100, 32, 11);
    g.fill();

    g.fillColor = new Color(154, 88, 42, 255);
    g.roundRect(-42, -48, 84, 10, 4);
    g.fill();

    g.fillColor = new Color(88, 54, 35, 255);
    g.roundRect(-22, -24, 44, 48, 13);
    g.fill();

    g.fillColor = new Color(230, 235, 240, 255);
    g.moveTo(0, 54);
    g.lineTo(-13, 7);
    g.lineTo(-6, -12);
    g.lineTo(6, -12);
    g.lineTo(13, 7);
    g.close();
    g.fill();

    g.fillColor = new Color(255, 255, 255, 125);
    g.moveTo(0, 45);
    g.lineTo(-2, -3);
    g.lineTo(6, -8);
    g.lineTo(10, 7);
    g.close();
    g.fill();

    let launcherSpriteNode = marker.getChildByName('LauncherSprite');
    if (!launcherSpriteNode) {
      launcherSpriteNode = new Node('LauncherSprite');
      marker.addChild(launcherSpriteNode);
    }
    launcherSpriteNode.setPosition(0, 0, 0);
    const launcherUI = launcherSpriteNode.getComponent(UITransform) ?? launcherSpriteNode.addComponent(UITransform);
    launcherUI.setContentSize(170, 170);
    const launcherSp = launcherSpriteNode.getComponent(Sprite) ?? launcherSpriteNode.addComponent(Sprite);
    launcherSp.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.launcherSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !launcherSp.isValid) {
        return;
      }
      launcherSp.spriteFrame = sf;
      g.clear();
    });

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

  private pushTimeScaleEffect(key: string, scale: number, duration: number): void {
    const nextToken = (this._timeScaleTokens.get(key) ?? 0) + 1;
    this._timeScaleTokens.set(key, nextToken);
    this._timeScaleEffects.set(key, scale);
    this.applyTimeScale();

    setTimeout(() => {
      if (this._timeScaleTokens.get(key) !== nextToken) {
        return;
      }

      this._timeScaleEffects.delete(key);
      this.applyTimeScale();
    }, duration * 1000);
  }

  private clearTimeScaleEffects(): void {
    this._timeScaleEffects.clear();
    this._timeScaleTokens.clear();
    this.setTimeScale(1);
  }

  private applyTimeScale(): void {
    let scale = 1;
    for (const value of this._timeScaleEffects.values()) {
      scale = Math.min(scale, value);
    }

    this.setTimeScale(scale);
  }

  private setTimeScale(scale: number): void {
    const scheduler = (director as unknown as { getScheduler?: () => { setTimeScale?: (value: number) => void } }).getScheduler?.();
    if (scheduler?.setTimeScale) {
      scheduler.setTimeScale(scale);
      this.setFallbackTimeScale(1);
      return;
    }

    this.setFallbackTimeScale(scale);
  }

  private setFallbackTimeScale(scale: number): void {
    (globalThis as unknown as { __flyKnifeTimeScale?: number }).__flyKnifeTimeScale = scale;
  }

  private getFallbackTimeScale(): number {
    return (globalThis as unknown as { __flyKnifeTimeScale?: number }).__flyKnifeTimeScale ?? 1;
  }

  private shakeScreen(strength: number, duration: number): void {
    const origin = this.node.position.clone();
    const step = 0.035;
    const repeats = Math.max(2, Math.floor(duration / step));

    Tween.stopAllByTarget(this.node);
    let chain = tween(this.node);
    for (let i = 0; i < repeats; i += 1) {
      const offset = new Vec3((Math.random() * 2 - 1) * strength, (Math.random() * 2 - 1) * strength, 0);
      chain = chain.to(step, { position: origin.clone().add(offset) });
    }

    chain.to(0.04, { position: origin }).start();
  }

  private spawnImpactFlash(worldPos: Vec3): void {
    const node = new Node('ImpactFlash');
    this.node.addChild(node);
    node.setWorldPosition(worldPos);

    const ui = node.addComponent(UITransform);
    ui.setContentSize(92, 92);

    const g = node.addComponent(Graphics);
    g.fillColor = new Color(255, 255, 255, 235);
    g.circle(0, 0, 32);
    g.fill();
    g.lineWidth = 4;
    g.strokeColor = new Color(255, 220, 120, 220);
    g.moveTo(-42, 0);
    g.lineTo(42, 0);
    g.moveTo(0, -42);
    g.lineTo(0, 42);
    g.stroke();

    const opacity = node.addComponent(UIOpacity);
    opacity.opacity = 255;

    tween(node)
      .to(0.16, { scale: new Vec3(1.45, 1.45, 1) })
      .start();
    tween(opacity)
      .to(0.18, { opacity: 0 })
      .call(() => node.destroy())
      .start();
  }

  private playSfx(type: 'hit' | 'fail' | 'combo'): void {
    const g = globalThis as unknown as {
      AudioContext?: new () => any;
      webkitAudioContext?: new () => any;
    };
    const AudioContextCtor = g.AudioContext ?? g.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const frequency = type === 'fail' ? 120 : type === 'combo' ? 660 : 420;
    const duration = type === 'fail' ? 0.16 : 0.08;

    oscillator.type = type === 'fail' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
    setTimeout(() => {
      if (typeof ctx.close === 'function') {
        void ctx.close();
      }
    }, duration * 1000 + 80);
  }

  private playLightVibration(): void {
    const wx = (globalThis as unknown as { wx?: { vibrateShort?: (data?: { type?: string }) => void } }).wx;
    wx?.vibrateShort?.({ type: 'light' });
  }

  private enterGameCompleted(): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this.clearAllKnives();
    this._state = GameState.Win;
    this.comboCount = 0;
    this._reverseWarningActive = false;
    this.unschedule(this.finishReverseWarning);
    this.clearTimeScaleEffects();
    this.turntable.setRotateEnabled(false);
    this.uiManager.setLevel(LevelConfig.totalLevels());
    this.uiManager.setRemaining(0);
    this.uiManager.setWinPanelContent('完美命中！', '再来一把', true);
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

    await this.preloadDir('bg', 0, 0.55);
    await this.preloadDir('western', 0.55, 0.45);

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
