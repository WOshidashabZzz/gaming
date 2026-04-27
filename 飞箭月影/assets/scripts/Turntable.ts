import { _decorator, Color, Component, Graphics, Node, Tween, UIOpacity, UITransform, Vec3, tween } from 'cc';
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
  private _breathTime = 0;
  private _hitBoost = 0;

  protected onLoad(): void {
    this.ensureVisual();
    this.ensureGlowLayer();
    this._baseScale = this.node.scale.clone();
  }

  protected start(): void {
    this.redrawDisk();
  }

  public applyLevel(speed: number, direction: 1 | -1): void {
    this.rotateSpeed = speed;
    this.rotateDirection = direction;
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

  protected update(dt: number): void {
    if (this._enabledRotate) {
      this.node.angle += this.rotateSpeed * this.rotateDirection * dt;
    }

    this.updateGlowBreath(dt);
  }

  private ensureVisual(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(this.radius * 2 + 20, this.radius * 2 + 20);

    this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
  }

  private ensureGlowLayer(): void {
    let glow = this.node.getChildByName('MoonGlow');
    if (!glow) {
      glow = new Node('MoonGlow');
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

  private redrawDisk(): void {
    const g = this.node.getComponent(Graphics);
    if (!g) {
      return;
    }

    g.clear();

    // 月球主体
    g.fillColor = this.diskColor;
    g.circle(0, 0, this.radius);
    g.fill();

    // 月球边缘高光
    g.lineWidth = 3;
    g.strokeColor = new Color(225, 230, 238, 255);
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

    const breath = (Math.sin(this._breathTime * 1.9) + 1) * 0.5;
    const glowScale = 1.02 + breath * 0.06 + this._hitBoost * 0.08;
    this._glowNode.setScale(glowScale, glowScale, 1);

    const opacity = 90 + breath * 70 + this._hitBoost * 55;
    this._glowOpacity.opacity = Math.min(230, Math.floor(opacity));
  }
}
