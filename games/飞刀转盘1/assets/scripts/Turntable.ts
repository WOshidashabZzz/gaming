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

    // 木盘暖色外光
    g.fillColor = new Color(218, 139, 62, 24);
    g.circle(0, 0, this.radius + 62);
    g.fill();

    // 中层暖光
    g.fillColor = new Color(255, 184, 92, 30);
    g.circle(0, 0, this.radius + 42);
    g.fill();

    // 外环线
    g.lineWidth = 2;
    g.strokeColor = new Color(245, 174, 92, 92);
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

    // 木质圆盘主体
    g.fillColor = new Color(126, 72, 34, 255);
    g.circle(0, 0, this.radius);
    g.fill();

    // 树皮边缘
    g.lineWidth = 7;
    g.strokeColor = new Color(76, 43, 24, 255);
    g.circle(0, 0, this.radius);
    g.stroke();

    // 年轮
    const rings = [0.82, 0.64, 0.46, 0.28, 0.12];
    const colors = [
      new Color(178, 104, 47, 255),
      new Color(103, 58, 30, 255),
      new Color(192, 119, 58, 255),
      new Color(116, 65, 32, 255),
      new Color(200, 135, 70, 255),
    ];
    rings.forEach((scale, index) => {
      g.lineWidth = index % 2 === 0 ? 8 : 5;
      g.strokeColor = colors[index];
      g.circle(0, 0, this.radius * scale);
      g.stroke();
    });

    // 木纹裂痕
    g.strokeColor = new Color(70, 38, 22, 135);
    g.lineWidth = 2.4;
    this.drawWoodGrain(g, -8, 10, -78, 42, -108, 30);
    this.drawWoodGrain(g, 10, -4, 58, -32, 100, -18);
    this.drawWoodGrain(g, -4, -12, -28, -70, -12, -110);
    this.drawWoodGrain(g, 16, 18, 40, 66, 24, 104);

    // 中心靶点
    g.fillColor = new Color(74, 43, 24, 255);
    g.circle(0, 0, 10);
    g.fill();
    g.strokeColor = new Color(232, 156, 78, 210);
    g.lineWidth = 2;
    g.circle(0, 0, 17);
    g.stroke();
  }

  private drawWoodGrain(g: Graphics, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void {
    g.moveTo(x1, y1);
    g.quadraticCurveTo(x2, y2, x3, y3);
    g.stroke();
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
