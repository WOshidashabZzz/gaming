import {
  _decorator,
  Color,
  Component,
  EventTouch,
  Graphics,
  HorizontalTextAlignment,
  Input,
  Label,
  LabelOutline,
  Node,
  ResolutionPolicy,
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
import { GAMEPLAY_TUNING, LevelConfig } from './LevelConfig';
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
  private _reverseWarningTimer = 0;
  private _reverseWarningActive = false;
  private _randomReverseActive = false;
  private _bootReady = false;
  private _debugTapCount = 0;
  private _debugTapStartedAt = 0;
  private _comboCount = 0;
  private _losePanelReady = false;
  private _hitStopTimer = 0;
  private _screenShakeTimer = 0;
  private _screenShakeDuration = 0;
  private _screenShakeStrength = 0;
  private _rootBasePosition = new Vec3();
  private _dangerKnifeNode: Node | null = null;
  private _dangerOpacity: UIOpacity | null = null;
  private _comboLabel: Label | null = null;
  private _screenFlashNode: Node | null = null;
  private _screenFlashOpacity: UIOpacity | null = null;
  private _slowMotionTimer = 0;

  protected onLoad(): void {
    this.applyPortraitResolution();
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
    (director.getScheduler() as any).setTimeScale?.(1);
  }

  protected update(dt: number): void {
    const hitStopped = this.updateHitStop(dt);
    this.updateScreenShake(dt);
    this.updateSlowMotion(dt);

    if (this._state !== GameState.Playing || !this.turntable || hitStopped) {
      if (this._state !== GameState.Playing) {
        this.clearDangerWarning();
      }
      return;
    }

    this.showDangerWarning();
    this.updateReverseTimer(dt);
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
    this._comboCount = 0;
    this._losePanelReady = false;
    this._hitStopTimer = 0;
    this._slowMotionTimer = 0;
    this.clearDangerWarning();
    (director.getScheduler() as any).setTimeScale?.(1);

    const levelData = LevelConfig.getLevel(this._currentLevelIndex);
    if (!levelData) {
      this.enterGameCompleted();
      return;
    }
    this._remainingKnives = levelData.knives;
    this._randomReverseActive = levelData.randomReverse === true;
    this._reverseInterval = this._randomReverseActive ? this.getRandomReverseInterval() : levelData.reverseInterval ?? 0;
    this._reverseElapsed = 0;
    this._reverseWarningTimer = 0;
    this._reverseWarningActive = false;

    this.turntable.resetTurntable();
    this.turntable.applyLevel(
      levelData.speed,
      levelData.dir,
      levelData.minSpeed,
      levelData.maxSpeed,
      levelData.wavePeriod,
      GAMEPLAY_TUNING.speedWave.enabled && GAMEPLAY_TUNING.speedWave.useSinWave,
    );
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
    this._reverseWarningTimer = 0;
    this._reverseWarningActive = false;
    this._losePanelReady = false;
    this.turntable.setRotateEnabled(true);
    this.uiManager.showPlayingHUD();
  }

  private onRestartLevel(): void {
    this.resetCurrentLevel();
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

    if (this._state === GameState.Lose) {
      if (this._losePanelReady) {
        this.resetCurrentLevel();
      }
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
    this.playHitFeedback(knife.node, hitWorldPos);

    this._attachedKnifeNodes.push(knife.node);
    this._insertedAngles.push(hitAngle);
    this._flyingKnife = null;
    this._comboCount += 1;
    this.playComboFeedback();

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
    this.clearDangerWarning();
    const hasNext = LevelConfig.hasLevel(this._currentLevelIndex + 1);
    if (hasNext) {
      this.uiManager.setWinPanelContent('星核突破！', '下一关', true);
    } else {
      this.uiManager.setWinPanelContent('星际穿越完成！', '重新挑战', true);
    }
    this.uiManager.showWinPanel();
  }

  private handleLose(knife: Knife, hitWorldPos: Vec3): void {
    if (!this.turntable || !this.uiManager) {
      return;
    }

    this._state = GameState.Lose;
    this._losePanelReady = false;
    this._flyingKnife = null;
    this.clearDangerWarning();

    this.playFailFeedback(hitWorldPos);
    knife.playFailDrop();
    this.turntable.setRotateEnabled(false);

    this.scheduleOnce(() => {
      if (this._state !== GameState.Lose || !this.uiManager) {
        return;
      }
      this._losePanelReady = true;
      this.uiManager.showLosePanel();
    }, GAMEPLAY_TUNING.feedback.failPanelDelay);
  }

  private resetCurrentLevel(): void {
    this.loadLevel(this._currentLevelIndex, false);
  }

  private playHitFeedback(knifeNode: Node, hitWorldPos: Vec3): void {
    this.startHitStop(GAMEPLAY_TUNING.feedback.hitStopSuccess);
    this.turntable?.playHitFeedback();
    this.spawnSpriteEffect('meteor/fx_hit_energy/spriteFrame', hitWorldPos, 150, 0.2, new Color(180, 235, 255, 230));
    this.playHitSound();

    Tween.stopAllByTarget(knifeNode);
    const base = knifeNode.scale.clone();
    const up = base.clone();
    up.x *= 1.08;
    up.y *= 1.08;
    tween(knifeNode).to(0.04, { scale: up }).to(0.08, { scale: base }).start();
  }

  private playFailFeedback(hitWorldPos: Vec3): void {
    this.startHitStop(GAMEPLAY_TUNING.feedback.hitStopFail);
    this.startScreenShake(GAMEPLAY_TUNING.feedback.screenShakeDuration, GAMEPLAY_TUNING.feedback.screenShakeStrength);
    this.spawnSpriteEffect('meteor/fx_fail_burst/spriteFrame', hitWorldPos, 210, 0.3, new Color(255, 205, 170, 245));
    this.playScreenFlash(0.16, new Color(255, 72, 72, 62));
    this.playFailSound();
  }

  private startHitStop(duration: number): void {
    this._hitStopTimer = Math.max(this._hitStopTimer, duration);
    this.turntable?.setRotateEnabled(false);
  }

  private updateHitStop(dt: number): boolean {
    if (this._hitStopTimer <= 0) {
      return false;
    }

    this._hitStopTimer = Math.max(0, this._hitStopTimer - dt);
    if (this._hitStopTimer <= 0 && this._state === GameState.Playing) {
      this.turntable?.setRotateEnabled(true);
    }

    return this._hitStopTimer > 0;
  }

  private startScreenShake(duration: number, strength: number): void {
    this._rootBasePosition = this.node.position.clone();
    this._screenShakeDuration = duration;
    this._screenShakeTimer = duration;
    this._screenShakeStrength = strength;
  }

  private updateScreenShake(dt: number): void {
    if (this._screenShakeTimer <= 0) {
      return;
    }

    this._screenShakeTimer = Math.max(0, this._screenShakeTimer - dt);
    const progress = this._screenShakeDuration > 0 ? this._screenShakeTimer / this._screenShakeDuration : 0;
    const strength = this._screenShakeStrength * progress;
    const offsetX = (Math.random() * 2 - 1) * strength;
    const offsetY = (Math.random() * 2 - 1) * strength;
    this.node.setPosition(this._rootBasePosition.x + offsetX, this._rootBasePosition.y + offsetY, this._rootBasePosition.z);

    if (this._screenShakeTimer <= 0) {
      this.node.setPosition(this._rootBasePosition);
    }
  }

  private spawnSpriteEffect(path: string, worldPos: Vec3, size: number, duration: number, fallbackColor: Color): void {
    const parent = this.knifeFlyLayer ?? this.node;
    const effect = new Node('FeedbackFx');
    parent.addChild(effect);
    effect.setWorldPosition(worldPos);
    effect.setScale(0.58, 0.58, 1);

    const ui = effect.addComponent(UITransform);
    ui.setContentSize(size, size);

    const opacity = effect.addComponent(UIOpacity);
    opacity.opacity = 255;

    const g = effect.addComponent(Graphics);
    g.fillColor = fallbackColor;
    g.circle(0, 0, size * 0.5);
    g.fill();

    const sprite = effect.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, fallbackColor.a);
    resources.load(path, SpriteFrame, (err, sf) => {
      if (err || !sf || !effect.isValid || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
      g.clear();
      g.enabled = false;
    });

    tween(effect)
      .to(duration, { scale: new Vec3(1.25, 1.25, 1) })
      .call(() => {
        if (effect.isValid) {
          effect.destroy();
        }
      })
      .start();

    tween(opacity).to(duration, { opacity: 0 }).start();
  }

  private playComboFeedback(): void {
    if (!this.turntable) {
      return;
    }

    const combo = GAMEPLAY_TUNING.combo;
    if (this._comboCount === combo.combo3) {
      this.showComboText('Combo x3', 0.5);
      this.turntable.playComboGlow(0.35);
    } else if (this._comboCount === combo.combo5) {
      this.showComboText('Nice Shot!', 0.55);
      this.turntable.playComboGlow(0.5);
      this.startSlowMotion(combo.slowMotionScale, combo.slowMotionDuration);
    } else if (this._comboCount === combo.combo8) {
      this.showComboText('Perfect!', 0.65);
      this.turntable.playComboGlow(0.8);
    }
  }

  private showComboText(text: string, duration: number): void {
    const label = this.ensureComboLabel();
    const node = label.node;
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);

    label.string = text;
    node.active = true;
    node.setScale(0.72, 0.72, 1);
    node.setPosition(0, 310, 0);
    opacity.opacity = 255;

    Tween.stopAllByTarget(node);
    Tween.stopAllByTarget(opacity);
    tween(node)
      .to(0.1, { scale: new Vec3(1.14, 1.14, 1) })
      .to(Math.max(0.01, duration - 0.18), { position: new Vec3(0, 350, 0), scale: new Vec3(1, 1, 1) })
      .call(() => {
        node.active = false;
      })
      .start();
    tween(opacity).delay(Math.max(0.01, duration - 0.18)).to(0.16, { opacity: 0 }).start();
  }

  private ensureComboLabel(): Label {
    if (this._comboLabel?.isValid) {
      return this._comboLabel;
    }

    let node = this.node.getChildByName('ComboFeedbackLabel');
    if (!node) {
      node = new Node('ComboFeedbackLabel');
      this.node.addChild(node);
    }

    const ui = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    ui.setContentSize(420, 86);

    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.fontSize = 48;
    label.lineHeight = 56;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.color = new Color(235, 250, 255, 255);

    const outline = node.getComponent(LabelOutline) ?? node.addComponent(LabelOutline);
    outline.color = new Color(70, 20, 120, 235);
    outline.width = 3;

    node.active = false;
    this._comboLabel = label;
    return label;
  }

  private startSlowMotion(scale: number, duration: number): void {
    (director.getScheduler() as any).setTimeScale?.(scale);
    this._slowMotionTimer = Math.max(this._slowMotionTimer, duration);
  }

  private updateSlowMotion(dt: number): void {
    if (this._slowMotionTimer <= 0) {
      return;
    }

    this._slowMotionTimer = Math.max(0, this._slowMotionTimer - dt);
    if (this._slowMotionTimer <= 0) {
      (director.getScheduler() as any).setTimeScale?.(1);
    }
  }

  private clearAllKnives(): void {
    this.clearDangerWarning();

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

  private updateReverseTimer(dt: number): void {
    if (!this.turntable || this._reverseInterval <= 0) {
      return;
    }

    if (this._randomReverseActive) {
      if (this._reverseWarningActive) {
        this._reverseWarningTimer = Math.max(0, this._reverseWarningTimer - dt);
        if (this._reverseWarningTimer <= 0) {
          this.turntable.reverseDirection();
          this._reverseWarningActive = false;
          this._reverseElapsed = 0;
          this._reverseInterval = this.getRandomReverseInterval();
        }
        return;
      }

      this._reverseElapsed += dt;
      if (this._reverseElapsed >= this._reverseInterval) {
        this._reverseWarningActive = true;
        this._reverseWarningTimer = GAMEPLAY_TUNING.reverse.warningDuration;
        this.turntable.playReverseWarning(GAMEPLAY_TUNING.reverse.warningDuration);
        this.playScreenFlash(GAMEPLAY_TUNING.reverse.warningDuration, new Color(255, 255, 255, 38));
        this.playWarningSound();
      }
      return;
    }

    this._reverseElapsed += dt;
    while (this._reverseElapsed >= this._reverseInterval) {
      this._reverseElapsed -= this._reverseInterval;
      this.turntable.reverseDirection();
    }
  }

  private getRandomReverseInterval(): number {
    const config = GAMEPLAY_TUNING.reverse;
    return config.minInterval + Math.random() * (config.maxInterval - config.minInterval);
  }

  private showDangerWarning(): void {
    if (!this.turntable || this._insertedAngles.length === 0 || this._flyingKnife) {
      this.clearDangerWarning();
      return;
    }

    const currentAngle = this.getCurrentLaunchAngle();
    const warningAngle = this.collisionAngleThreshold + GAMEPLAY_TUNING.collision.warningAngleOffset;
    let nearestIndex = -1;
    let nearestDiff = 999;

    for (let i = 0; i < this._insertedAngles.length; i += 1) {
      const diff = this.minAngleDiff(currentAngle, this._insertedAngles[i]);
      if (diff < warningAngle && diff < nearestDiff) {
        nearestDiff = diff;
        nearestIndex = i;
      }
    }

    if (nearestIndex < 0) {
      this.clearDangerWarning();
      return;
    }

    const dangerNode = this._attachedKnifeNodes[nearestIndex];
    if (!dangerNode?.isValid) {
      this.clearDangerWarning();
      return;
    }

    if (this._dangerKnifeNode !== dangerNode) {
      this.clearDangerWarning();
      this._dangerKnifeNode = dangerNode;
      this._dangerOpacity = dangerNode.getComponent(UIOpacity) ?? dangerNode.addComponent(UIOpacity);
    }

    const pulse = (Math.sin((director.getTotalTime() / 1000) * 18) + 1) * 0.5;
    if (this._dangerOpacity) {
      this._dangerOpacity.opacity = Math.floor(145 + pulse * 110);
    }
  }

  private clearDangerWarning(): void {
    if (this._dangerOpacity?.isValid) {
      this._dangerOpacity.opacity = 255;
    }
    this._dangerKnifeNode = null;
    this._dangerOpacity = null;
  }

  private getCurrentLaunchAngle(): number {
    if (!this.turntable) {
      return 0;
    }

    const turntableWorld = this.turntable.node.worldPosition;
    return this.calcHitAngleInTurntableLocal(new Vec3(turntableWorld.x, turntableWorld.y - this.turntable.radius, turntableWorld.z));
  }

  private playScreenFlash(duration: number, color: Color): void {
    const node = this.ensureScreenFlashNode(color);
    const opacity = this._screenFlashOpacity;
    if (!opacity) {
      return;
    }

    node.active = true;
    opacity.opacity = color.a;

    Tween.stopAllByTarget(opacity);
    tween(opacity)
      .to(duration, { opacity: 0 })
      .call(() => {
        node.active = false;
      })
      .start();
  }

  private ensureScreenFlashNode(color: Color): Node {
    if (this._screenFlashNode?.isValid) {
      const g = this._screenFlashNode.getComponent(Graphics);
      if (g) {
        this.drawScreenFlash(g, color);
      }
      return this._screenFlashNode;
    }

    const flash = new Node('ScreenFlash');
    this.node.addChild(flash);
    flash.setSiblingIndex(this.node.children.length - 1);
    flash.setPosition(0, 0, 0);

    const ui = flash.addComponent(UITransform);
    const size = this.getVisibleSize();
    ui.setContentSize(size.width, size.height);

    const g = flash.addComponent(Graphics);
    this.drawScreenFlash(g, color);

    const opacity = flash.addComponent(UIOpacity);
    opacity.opacity = 0;
    flash.active = false;

    this._screenFlashNode = flash;
    this._screenFlashOpacity = opacity;
    return flash;
  }

  private drawScreenFlash(g: Graphics, color: Color): void {
    const size = this.getVisibleSize();
    g.clear();
    g.fillColor = color;
    g.rect(-size.width * 0.5, -size.height * 0.5, size.width, size.height);
    g.fill();
  }

  private playHitSound(): void {
    this.playTone(740, 0.045, 0.035, 'triangle');
  }

  private playFailSound(): void {
    this.playTone(120, 0.12, 0.08, 'sawtooth');
  }

  private playWarningSound(): void {
    this.playTone(520, 0.055, 0.025, 'square');
  }

  private playTone(frequency: number, duration: number, volume: number, type: string): void {
    const AudioContextCtor = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = new AudioContextCtor();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      void ctx.close?.();
    };
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

    resources.load('meteor/bg_game_meteor/spriteFrame', SpriteFrame, (err, sf) => {
      if (err || !sf || !sp.isValid) {
        return;
      }
      sp.spriteFrame = sf;
    });
  }

  private getVisibleSize(): { width: number; height: number } {
    return { width: 1170, height: 2532 };
  }

  private applyPortraitResolution(): void {
    view.setDesignResolutionSize(1170, 2532, ResolutionPolicy.SHOW_ALL);
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
    ui.setContentSize(220, 220);

    const g = marker.getComponent(Graphics) ?? marker.addComponent(Graphics);
    g.clear();

    // 发射器能量翼阴影
    g.lineWidth = 8;
    g.strokeColor = new Color(0, 0, 0, 65);
    g.moveTo(-46, -12);
    g.quadraticCurveTo(0, 34, 46, -12);
    g.stroke();

    // 发射器能量翼主体
    g.lineWidth = 7;
    g.strokeColor = new Color(154, 98, 56, 255);
    g.moveTo(-44, -11);
    g.quadraticCurveTo(0, 33, 44, -11);
    g.stroke();

    // 发射器能量翼高光
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

    // 发射器主体阴影
    g.fillColor = new Color(0, 0, 0, 72);
    g.roundRect(-13, -44, 26, 57, 7);
    g.fill();

    // 发射器主体
    g.fillColor = new Color(90, 70, 50, 255);
    g.roundRect(-11, -42, 22, 54, 7);
    g.fill();

    // 发射器主体高光
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

    g.clear();
    g.fillColor = new Color(0, 0, 0, 80);
    g.ellipse(0, -46, 52, 18);
    g.fill();

    g.fillColor = new Color(18, 24, 58, 255);
    g.roundRect(-46, -58, 92, 34, 12);
    g.fill();
    g.strokeColor = new Color(115, 214, 255, 230);
    g.lineWidth = 3;
    g.roundRect(-46, -58, 92, 34, 12);
    g.stroke();

    g.fillColor = new Color(38, 52, 120, 255);
    g.moveTo(-34, -24);
    g.lineTo(-18, 34);
    g.lineTo(-5, 44);
    g.lineTo(-10, -24);
    g.close();
    g.fill();
    g.moveTo(34, -24);
    g.lineTo(18, 34);
    g.lineTo(5, 44);
    g.lineTo(10, -24);
    g.close();
    g.fill();

    g.strokeColor = new Color(184, 82, 255, 230);
    g.lineWidth = 4;
    g.moveTo(-18, 30);
    g.lineTo(-8, -18);
    g.moveTo(18, 30);
    g.lineTo(8, -18);
    g.stroke();

    g.fillColor = new Color(16, 22, 64, 255);
    g.roundRect(-18, -36, 36, 74, 11);
    g.fill();
    g.strokeColor = new Color(92, 228, 255, 255);
    g.lineWidth = 3;
    g.roundRect(-18, -36, 36, 74, 11);
    g.stroke();

    g.fillColor = new Color(128, 60, 255, 230);
    g.circle(0, -2, 14);
    g.fill();
    g.fillColor = new Color(104, 232, 255, 255);
    g.circle(0, -2, 7);
    g.fill();

    g.strokeColor = new Color(236, 250, 255, 230);
    g.lineWidth = 3;
    g.moveTo(0, 38);
    g.lineTo(0, 70);
    g.stroke();

    g.fillColor = new Color(255, 132, 42, 230);
    g.moveTo(0, 78);
    g.lineTo(-6, 66);
    g.lineTo(6, 66);
    g.close();
    g.fill();

    this.applyLauncherSprite(marker, g);
    this._launchMarker = marker;
  }

  private applyLauncherSprite(marker: Node, fallbackGraphics: Graphics): void {
    let spriteNode = marker.getChildByName('LauncherSprite');
    if (!spriteNode) {
      spriteNode = new Node('LauncherSprite');
      marker.addChild(spriteNode);
    }

    spriteNode.setPosition(0, -2, 0);
    spriteNode.setSiblingIndex(marker.children.length - 1);

    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(170, 170);

    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);

    resources.load('meteor/launcher_meteor/spriteFrame', SpriteFrame, (err, sf) => {
      if (err || !sf || !spriteNode.isValid || !sprite.isValid) {
        spriteNode.active = false;
        fallbackGraphics.enabled = true;
        return;
      }

      sprite.spriteFrame = sf;
      spriteNode.active = true;
      fallbackGraphics.clear();
      fallbackGraphics.enabled = false;
    });
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
    this.uiManager.setWinPanelContent('星际穿越完成！', '重新挑战', true);
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

    await this.preloadDir('bg', 0, 0.25);
    await this.preloadDir('meteor', 0.25, 0.75);

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
