import { _decorator, Color, Component, Graphics, Node, Tween, tween, UITransform, Vec3 } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Knife')
export class Knife extends Component {
  @property
  public flySpeed = 1200;

  private _isFlying = false;
  private _targetY = 0;

  public onReachTarget: ((knife: Knife) => void) | null = null;

  protected onLoad(): void {
    this.ensureVisual();
  }

  public launch(startWorldPos: Vec3, targetY: number): void {
    this.node.setWorldPosition(startWorldPos);
    this._targetY = targetY;
    this._isFlying = true;

    this.playLaunchFeedback();
  }

  public attachToTurntable(turntable: Node, localAngleDeg: number, radius: number): void {
    this._isFlying = false;
    this.node.setParent(turntable);

    const rad = (localAngleDeg * Math.PI) / 180;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius;
    this.node.setPosition(x, y, 0);

    this.node.angle = localAngleDeg + 90;
    this.playAttachFeedback();
  }

  public playFailDrop(): void {
    this._isFlying = false;

    Tween.stopAllByTarget(this.node);
    const side = Math.random() > 0.5 ? 1 : -1;
    tween(this.node)
      .by(0.35, {
        position: new Vec3(140 * side, -520, 0),
        angle: 120 * side,
      })
      .start();
  }

  protected update(dt: number): void {
    if (!this._isFlying) {
      return;
    }

    const pos = this.node.worldPosition;
    const nextY = pos.y + this.flySpeed * dt;

    if (nextY >= this._targetY) {
      this.node.setWorldPosition(pos.x, this._targetY, pos.z);
      this._isFlying = false;
      this.onReachTarget?.(this);
      return;
    }

    this.node.setWorldPosition(pos.x, nextY, pos.z);
  }

  private playLaunchFeedback(): void {
    this.node.setScale(0.92, 0.92, 1);
    Tween.stopAllByTarget(this.node);
    tween(this.node).to(0.08, { scale: new Vec3(1, 1, 1) }).start();
  }

  private playAttachFeedback(): void {
    Tween.stopAllByTarget(this.node);
    const base = this.node.scale.clone();
    const up = base.clone();
    up.x *= 1.1;
    up.y *= 1.1;

    tween(this.node)
      .to(0.04, { scale: up })
      .to(0.06, { scale: base })
      .start();
  }

  private ensureVisual(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(42, 118);

    const g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.drawKnife(g);
  }

  private drawKnife(g: Graphics): void {
    g.clear();

    // 刀身阴影
    g.fillColor = new Color(0, 0, 0, 70);
    g.moveTo(2, 58);
    g.lineTo(-15, 6);
    g.lineTo(-8, -10);
    g.lineTo(8, -10);
    g.lineTo(15, 6);
    g.close();
    g.fill();

    // 宽刃刀身
    g.fillColor = new Color(214, 222, 226, 255);
    g.moveTo(0, 61);
    g.lineTo(-13, 8);
    g.lineTo(-7, -8);
    g.lineTo(7, -8);
    g.lineTo(13, 8);
    g.close();
    g.fill();

    // 刀刃高光
    g.fillColor = new Color(255, 255, 255, 135);
    g.moveTo(0, 53);
    g.lineTo(-2.5, -1);
    g.lineTo(6, -5);
    g.lineTo(11, 8);
    g.close();
    g.fill();

    // 护手
    g.fillColor = new Color(58, 38, 27, 255);
    g.roundRect(-19, -12, 38, 9, 4);
    g.fill();

    g.fillColor = new Color(152, 92, 45, 255);
    g.roundRect(-16, -10, 32, 6, 3);
    g.fill();

    // 刀柄
    g.fillColor = new Color(76, 45, 29, 255);
    g.roundRect(-8, -47, 16, 38, 5);
    g.fill();

    g.strokeColor = new Color(178, 108, 55, 220);
    g.lineWidth = 2.2;
    for (let y = -41; y <= -17; y += 8) {
      g.moveTo(-7, y);
      g.lineTo(7, y + 6);
      g.stroke();
    }

    g.fillColor = new Color(42, 27, 21, 255);
    g.circle(0, -50, 7);
    g.fill();

    g.strokeColor = new Color(78, 86, 92, 210);
    g.lineWidth = 1.4;
    g.moveTo(-13, 8);
    g.lineTo(13, 8);
    g.stroke();
  }
}
