import { _decorator, Color, Component, Graphics, Node, Sprite, SpriteFrame, Tween, UIOpacity, UITransform, Vec3, resources, tween } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Turntable')
export class Turntable extends Component {
  @property
  public radius = 120;

  @property
  public rotateSpeed = 120;

  @property({ tooltip: '1: 顺时针, -1: 逆时针' })
  public rotateDirection: 1 | -1 = 1;

  @property(Color)
  public diskColor: Color = new Color(190, 196, 205, 255);

  private _enabledRotate = true;
  private _baseScale = new Vec3(1, 1, 1);
  private _glowNode: Node | null = null;
  private _glowOpacity: UIOpacity | null = null;
  private _warningNode: Node | null = null;
  private _warningOpacity: UIOpacity | null = null;
  private _breathTime = 0;
  private _hitBoost = 0;
  private _comboGlowTimer = 0;
  private _warningTimer = 0;
  private _warningDuration = 0;
  private _speedWaveEnabled = false;
  private _minSpeed = 120;
  private _maxSpeed = 120;
  private _wavePeriod = 4;
  private _waveTime = 0;

  protected onLoad(): void {
    this.ensureVisual();
    this.ensureGlowLayer();
    this.ensureWarningLayer();
    this._baseScale = this.node.scale.clone();
  }

  protected start(): void {
    this.redrawDisk();
  }

  public applyLevel(
    speed: number,
    direction: 1 | -1,
    minSpeed?: number,
    maxSpeed?: number,
    wavePeriod?: number,
    speedWaveEnabled = true,
  ): void {
    this.rotateSpeed = speed;
    this.rotateDirection = direction;
    this._minSpeed = minSpeed ?? speed;
    this._maxSpeed = maxSpeed ?? speed;
    this._wavePeriod = Math.max(0.1, wavePeriod ?? 4);
    this._speedWaveEnabled = speedWaveEnabled && this._maxSpeed > this._minSpeed;
    this._waveTime = 0;
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
    this._comboGlowTimer = 0;
    this._warningTimer = 0;
    if (this._warningNode) {
      this._warningNode.active = false;
    }
  }

  public playHitFeedback(): void {
    this._hitBoost = 1;

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

  public playComboGlow(duration: number): void {
    this._comboGlowTimer = Math.max(this._comboGlowTimer, duration);
  }

  public playReverseWarning(duration: number): void {
    if (!this._warningNode) {
      return;
    }

    this._warningDuration = Math.max(0.01, duration);
    this._warningTimer = this._warningDuration;
    this._warningNode.active = true;
  }

  protected update(dt: number): void {
    this.updateDynamicSpeed(dt);

    if (this._enabledRotate) {
      this.node.angle += this.rotateSpeed * this.rotateDirection * dt;
    }

    this.updateGlowBreath(dt);
    this.updateReverseWarning(dt);
  }

  private updateDynamicSpeed(dt: number): void {
    if (!this._speedWaveEnabled) {
      return;
    }

    this._waveTime += dt;
    const baseSpeed = (this._minSpeed + this._maxSpeed) * 0.5;
    const waveAmplitude = (this._maxSpeed - this._minSpeed) * 0.5;
    this.rotateSpeed = baseSpeed + waveAmplitude * Math.sin((this._waveTime / this._wavePeriod) * Math.PI * 2);
  }

  private ensureVisual(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 20, this.radius * 2 + 20);

    this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.applyMeteorCoreSprite();
  }

  private ensureGlowLayer(): void {
    let glow = this.node.getChildByName('MeteorCoreGlow');
    if (!glow) {
      glow = new Node('MeteorCoreGlow');
      this.node.addChild(glow);
      glow.setSiblingIndex(0);
    }

    const ui = glow.getComponent(UITransform) ?? glow.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 140, this.radius * 2 + 140);

    const g = glow.getComponent(Graphics) ?? glow.addComponent(Graphics);
    g.clear();

    // 星际能量外辉光
    g.fillColor = new Color(135, 60, 255, 30);
    g.circle(0, 0, this.radius + 62);
    g.fill();

    // 星核中层辉光
    g.fillColor = new Color(80, 205, 255, 26);
    g.circle(0, 0, this.radius + 42);
    g.fill();

    // 外环线
    g.lineWidth = 2;
    g.strokeColor = new Color(190, 95, 255, 120);
    g.circle(0, 0, this.radius + 20);
    g.stroke();

    const op = glow.getComponent(UIOpacity) ?? glow.addComponent(UIOpacity);
    op.opacity = 130;

    this._glowNode = glow;
    this._glowOpacity = op;
  }

  private ensureWarningLayer(): void {
    let warning = this.node.getChildByName('ReverseWarningFlash');
    if (!warning) {
      warning = new Node('ReverseWarningFlash');
      this.node.addChild(warning);
    }

    const ui = warning.getComponent(UITransform) ?? warning.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 110, this.radius * 2 + 110);

    const g = warning.getComponent(Graphics) ?? warning.addComponent(Graphics);
    g.clear();
    g.fillColor = new Color(255, 68, 68, 46);
    g.circle(0, 0, this.radius + 48);
    g.fill();
    g.strokeColor = new Color(255, 245, 245, 230);
    g.lineWidth = 5;
    g.circle(0, 0, this.radius + 18);
    g.stroke();

    const op = warning.getComponent(UIOpacity) ?? warning.addComponent(UIOpacity);
    op.opacity = 0;
    warning.active = false;

    this._warningNode = warning;
    this._warningOpacity = op;
  }

  private redrawDisk(): void {
    const g = this.node.getComponent(Graphics);
    if (!g) {
      return;
    }

    g.clear();

    // 陨石核心主体兜底图形；贴图加载成功后会清掉它。
    g.fillColor = new Color(35, 26, 58, 255);
    g.circle(0, 0, this.radius);
    g.fill();

    // 星核边缘高光
    g.lineWidth = 3;
    g.strokeColor = new Color(190, 86, 255, 255);
    g.circle(0, 0, this.radius);
    g.stroke();

    // 阴影层增强立体感
    g.fillColor = new Color(16, 12, 32, 120);
    g.circle(this.radius * 0.18, -this.radius * 0.1, this.radius * 0.86);
    g.fill();

    // 星核柔和高光
    g.fillColor = new Color(176, 80, 255, 72);
    g.circle(-this.radius * 0.2, this.radius * 0.25, this.radius * 0.48);
    g.fill();

    // 陨石裂纹
    this.drawCrater(g, -40, 36, 18);
    this.drawCrater(g, 32, 28, 14);
    this.drawCrater(g, -18, -22, 12);
    this.drawCrater(g, 40, -14, 20);
    this.drawCrater(g, -52, -40, 10);
    this.drawCrater(g, 8, 52, 9);
  }

  private drawCrater(g: Graphics, x: number, y: number, r: number): void {
    g.fillColor = new Color(24, 18, 38, 150);
    g.circle(x, y, r);
    g.fill();

    g.fillColor = new Color(176, 72, 255, 92);
    g.circle(x - r * 0.28, y + r * 0.24, r * 0.42);
    g.fill();
  }

  private applyMeteorCoreSprite(): void {
    const sprite = this.node.getComponent(Sprite) ?? this.node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);

    resources.load('meteor/meteor_core/spriteFrame', SpriteFrame, (err, sf) => {
      if (err || !sf || !this.node.isValid || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
    });
  }

  private updateGlowBreath(dt: number): void {
    if (!this._glowNode || !this._glowOpacity) {
      return;
    }

    this._breathTime += dt;
    this._hitBoost = Math.max(0, this._hitBoost - dt * 4.2);
    this._comboGlowTimer = Math.max(0, this._comboGlowTimer - dt);

    const breath = (Math.sin(this._breathTime * 1.9) + 1) * 0.5;
    const comboBoost = this._comboGlowTimer > 0 ? 0.1 : 0;
    const glowScale = 1.02 + breath * 0.06 + this._hitBoost * 0.08 + comboBoost;
    this._glowNode.setScale(glowScale, glowScale, 1);

    const opacity = 90 + breath * 70 + this._hitBoost * 55 + (this._comboGlowTimer > 0 ? 58 : 0);
    this._glowOpacity.opacity = Math.min(230, Math.floor(opacity));
  }

  private updateReverseWarning(dt: number): void {
    if (!this._warningNode || !this._warningOpacity || this._warningTimer <= 0) {
      return;
    }

    this._warningTimer = Math.max(0, this._warningTimer - dt);
    const t = 1 - this._warningTimer / this._warningDuration;
    const flash = Math.abs(Math.sin(t * Math.PI * 8));
    this._warningOpacity.opacity = Math.floor(70 + flash * 150);
    this._warningNode.angle = -this.node.angle;

    if (this._warningTimer <= 0) {
      this._warningOpacity.opacity = 0;
      this._warningNode.active = false;
    }
  }
}
