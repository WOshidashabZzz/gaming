import { _decorator, Color, Component, Graphics, Node, Tween, UIOpacity, UITransform, Vec3, tween } from 'cc';
import { Sprite, SpriteFrame, resources } from 'cc';
import { WesternSkin } from './SkinConfig';

const { ccclass, property } = _decorator;

@ccclass('Turntable')
export class Turntable extends Component {
  @property
  public radius = 120;

  @property
  public rotateSpeed = 120;

  @property({ tooltip: '动态转速最低值' })
  public minSpeed = 140;

  @property({ tooltip: '动态转速最高值' })
  public maxSpeed = 180;

  @property({ tooltip: '转速慢快慢循环周期（秒）' })
  public speedPulsePeriod = 5;

  @property({ tooltip: '1: 顺时针, -1: 逆时针' })
  public rotateDirection: 1 | -1 = 1;

  @property(Color)
  public diskColor: Color = new Color(190, 196, 205, 255);

  private _enabledRotate = true;
  private _baseScale = new Vec3(1, 1, 1);
  private _glowNode: Node | null = null;
  private _glowOpacity: UIOpacity | null = null;
  private _flashOpacity: UIOpacity | null = null;
  private _targetSprite: Sprite | null = null;
  private _breathTime = 0;
  private _hitBoost = 0;
  private _comboGlowTime = 0;
  private _speedPulseTime = 0;
  private _speedPulseEnabled = true;

  protected onLoad(): void {
    this.ensureVisual();
    this.ensureGlowLayer();
    this.ensureFlashLayer();
    this._baseScale = this.node.scale.clone();
  }

  protected start(): void {
    this.redrawDisk();
  }

  public applyLevel(speed: number, direction: 1 | -1): void {
    this.rotateSpeed = speed;
    this.rotateDirection = direction;
    this._speedPulseTime = 0;
  }

  public setSpeedPulse(minSpeed: number, maxSpeed: number, period: number): void {
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
    this.speedPulsePeriod = Math.max(0.1, period);
    this._speedPulseTime = 0;
    this._speedPulseEnabled = true;
    this.rotateSpeed = minSpeed;
  }

  public reverseDirection(): void {
    this.rotateDirection = this.rotateDirection === 1 ? -1 : 1;
  }

  public setRotateEnabled(enabled: boolean): void {
    this._enabledRotate = enabled;
  }

  public resetTurntable(): void {
    this.node.angle = 0;
    this._enabledRotate = true;
    this.node.setScale(this._baseScale);
    this._breathTime = 0;
    this._hitBoost = 0;
    this._comboGlowTime = 0;
    this._speedPulseTime = 0;
    if (this._flashOpacity) {
      Tween.stopAllByTarget(this._flashOpacity);
      this._flashOpacity.opacity = 0;
    }
  }

  public playHitFeedback(): void {
    this._hitBoost = 1;
    this.playMoonFlash(82, 0.04, 0.08);

    Tween.stopAllByTarget(this.node);
    this.node.setScale(this._baseScale);

    const up = this._baseScale.clone();
    up.x *= 1.05;
    up.y *= 1.05;

    tween(this.node)
      .to(0.05, { scale: up })
      .to(0.07, { scale: this._baseScale })
      .start();
  }

  public playComboPulse(): void {
    Tween.stopAllByTarget(this.node);
    this.node.setScale(this._baseScale);

    const up = this._baseScale.clone();
    up.x *= 1.05;
    up.y *= 1.05;

    tween(this.node)
      .to(0.1, { scale: up })
      .to(0.1, { scale: this._baseScale })
      .start();
  }

  public playComboGlow(duration = 1): void {
    this._comboGlowTime = Math.max(this._comboGlowTime, duration);
    this.playMoonFlash(105, 0.08, 0.16);
  }

  public playReverseWarning(duration = 0.5): void {
    if (!this._flashOpacity) {
      return;
    }

    Tween.stopAllByTarget(this._flashOpacity);
    this._flashOpacity.opacity = 0;

    const pulseDuration = Math.max(0.08, duration / 4);
    tween(this._flashOpacity)
      .to(pulseDuration, { opacity: 120 })
      .to(pulseDuration, { opacity: 0 })
      .to(pulseDuration, { opacity: 120 })
      .to(pulseDuration, { opacity: 0 })
      .start();
  }

  protected update(dt: number): void {
    const scaledDt = dt * this.getFallbackTimeScale();
    this.updateDynamicSpeed(scaledDt);

    if (this._enabledRotate) {
      this.node.angle += this.rotateSpeed * this.rotateDirection * scaledDt;
    }

    this.updateGlowBreath(scaledDt);
  }

  private ensureVisual(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 20, this.radius * 2 + 20);

    this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.ensureTargetSprite();
  }

  private ensureTargetSprite(): void {
    let spriteNode = this.node.getChildByName('TargetSprite');
    if (!spriteNode) {
      spriteNode = new Node('TargetSprite');
      this.node.addChild(spriteNode);
    }
    spriteNode.setSiblingIndex(1);
    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 28, this.radius * 2 + 28);

    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this._targetSprite = sprite;

    resources.load(WesternSkin.targetSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
      this.node.getComponent(Graphics)?.clear();
    });
  }

  private ensureGlowLayer(): void {
    let glow = this.node.getChildByName('TargetGlow');
    if (!glow) {
      glow = new Node('TargetGlow');
      this.node.addChild(glow);
      glow.setSiblingIndex(0);
    }

    const ui = glow.getComponent(UITransform) ?? glow.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 140, this.radius * 2 + 140);

    const g = glow.getComponent(Graphics) ?? glow.addComponent(Graphics);
    g.clear();

    // 外围雾光
    g.fillColor = new Color(155, 185, 255, 26);
    g.circle(0, 0, this.radius + 62);
    g.fill();

    // 中层辉光
    g.fillColor = new Color(188, 210, 255, 34);
    g.circle(0, 0, this.radius + 42);
    g.fill();

    // 外环线
    g.lineWidth = 2;
    g.strokeColor = new Color(165, 198, 255, 92);
    g.circle(0, 0, this.radius + 20);
    g.stroke();

    const op = glow.getComponent(UIOpacity) ?? glow.addComponent(UIOpacity);
    op.opacity = 130;

    this._glowNode = glow;
    this._glowOpacity = op;
  }

  private ensureFlashLayer(): void {
    let flash = this.node.getChildByName('MoonFlash');
    if (!flash) {
      flash = new Node('MoonFlash');
      this.node.addChild(flash);
    }

    const ui = flash.getComponent(UITransform) ?? flash.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 18, this.radius * 2 + 18);

    const g = flash.getComponent(Graphics) ?? flash.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 255, 255, 255);
    g.circle(0, 0, this.radius + 5);
    g.fill();

    const op = flash.getComponent(UIOpacity) ?? flash.addComponent(UIOpacity);
    op.opacity = 0;

    this._flashOpacity = op;
  }

  private redrawDisk(): void {
    const g = this.node.getComponent(Graphics);
    if (!g) {
      return;
    }

    g.clear();

    if (this._targetSprite?.spriteFrame) {
      return;
    }

    // 木质圆靶兜底图形；贴图加载成功后不绘制。
    g.fillColor = new Color(128, 72, 34, 255);
    g.circle(0, 0, this.radius);
    g.fill();

    g.lineWidth = 8;
    g.strokeColor = new Color(53, 35, 24, 255);
    g.circle(0, 0, this.radius);
    g.stroke();

    // 阴影层增强立体感
    g.fillColor = new Color(140, 148, 160, 120);
    g.circle(this.radius * 0.18, -this.radius * 0.1, this.radius * 0.86);
    g.fill();

    // 月面柔和高光
    g.fillColor = new Color(242, 246, 252, 54);
    g.circle(-this.radius * 0.2, this.radius * 0.25, this.radius * 0.48);
    g.fill();

    // 陨石坑
    this.drawCrater(g, -40, 36, 18);
    this.drawCrater(g, 32, 28, 14);
    this.drawCrater(g, -18, -22, 12);
    this.drawCrater(g, 40, -14, 20);
    this.drawCrater(g, -52, -40, 10);
    this.drawCrater(g, 8, 52, 9);
  }

  private drawCrater(g: Graphics, x: number, y: number, r: number): void {
    g.fillColor = new Color(128, 136, 148, 150);
    g.circle(x, y, r);
    g.fill();

    g.fillColor = new Color(206, 212, 220, 95);
    g.circle(x - r * 0.28, y + r * 0.24, r * 0.42);
    g.fill();
  }

  private updateGlowBreath(dt: number): void {
    if (!this._glowNode || !this._glowOpacity) {
      return;
    }

    this._breathTime += dt;
    this._hitBoost = Math.max(0, this._hitBoost - dt * 4.2);
    this._comboGlowTime = Math.max(0, this._comboGlowTime - dt);

    const breath = (Math.sin(this._breathTime * 1.9) + 1) * 0.5;
    const comboBoost = this._comboGlowTime > 0 ? 1 : 0;
    const glowScale = 1.02 + breath * 0.06 + this._hitBoost * 0.08 + comboBoost * 0.14;
    this._glowNode.setScale(glowScale, glowScale, 1);

    const opacity = 90 + breath * 70 + this._hitBoost * 55 + comboBoost * 95;
    this._glowOpacity.opacity = Math.min(230, Math.floor(opacity));
  }

  private playMoonFlash(peakOpacity: number, fadeIn: number, fadeOut: number): void {
    if (!this._flashOpacity) {
      return;
    }

    Tween.stopAllByTarget(this._flashOpacity);
    this._flashOpacity.opacity = 0;

    tween(this._flashOpacity)
      .to(fadeIn, { opacity: peakOpacity })
      .to(fadeOut, { opacity: 0 })
      .start();
  }

  private updateDynamicSpeed(dt: number): void {
    if (!this._speedPulseEnabled) {
      return;
    }

    this._speedPulseTime += dt;
    const phase = (this._speedPulseTime / this.speedPulsePeriod) * Math.PI * 2 - Math.PI * 0.5;
    const t = (Math.sin(phase) + 1) * 0.5;
    this.rotateSpeed = this.minSpeed + (this.maxSpeed - this.minSpeed) * t;
  }

  private getFallbackTimeScale(): number {
    return (globalThis as unknown as { __flyKnifeTimeScale?: number }).__flyKnifeTimeScale ?? 1;
  }
}
