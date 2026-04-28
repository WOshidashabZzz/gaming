import {
  _decorator,
  Color,
  Component,
  Graphics,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UITransform,
  Vec3,
  resources,
  tween,
} from 'cc';
const { ccclass, property } = _decorator;

@ccclass('Knife')
export class Knife extends Component {
  @property
  public flySpeed = 1200;

  private _isFlying = false;
  private _targetY = 0;
  private _spriteNode: Node | null = null;

  public onReachTarget: ((knife: Knife) => void) | null = null;

  protected onLoad(): void {
    this.ensureVisual();
  }

  public launch(startWorldPos: Vec3, targetY: number): void {
    this.node.setWorldPosition(startWorldPos);
    this._targetY = targetY;
    this._isFlying = true;

    this.applyBladeSprite('meteor/blade_flying/spriteFrame');
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
    this.applyBladeSprite('meteor/blade_stuck/spriteFrame');
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
    up.x *= 1.08;
    up.y *= 1.08;

    tween(this.node)
      .to(0.04, { scale: up })
      .to(0.06, { scale: base })
      .start();
  }

  private ensureVisual(): void {
    const ui = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ui.setContentSize(64, 176);

    const g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    g.enabled = true;
    this.drawEnergyBlade(g);
    this.applyBladeSprite('meteor/blade_flying/spriteFrame');
  }

  private applyBladeSprite(path: string): void {
    const spriteNode = this.ensureSpriteNode();
    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);

    resources.load(path, SpriteFrame, (err, sf) => {
      if (err || !sf || !spriteNode.isValid || !sprite.isValid) {
        spriteNode.active = false;
        return;
      }

      sprite.spriteFrame = sf;
      spriteNode.active = true;

      const g = this.node.getComponent(Graphics);
      if (g) {
        g.clear();
        g.enabled = false;
      }
    });
  }

  private ensureSpriteNode(): Node {
    if (this._spriteNode?.isValid) {
      return this._spriteNode;
    }

    let spriteNode = this.node.getChildByName('BladeSprite');
    if (!spriteNode) {
      spriteNode = new Node('BladeSprite');
      this.node.addChild(spriteNode);
    }

    spriteNode.setPosition(0, 0, 0);
    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(64, 176);

    this._spriteNode = spriteNode;
    return spriteNode;
  }

  private drawEnergyBlade(g: Graphics): void {
    g.clear();

    g.fillColor = new Color(60, 180, 255, 48);
    g.moveTo(0, 84);
    g.lineTo(-25, 20);
    g.lineTo(-10, -68);
    g.lineTo(0, -86);
    g.lineTo(10, -68);
    g.lineTo(25, 20);
    g.close();
    g.fill();

    g.fillColor = new Color(20, 50, 145, 255);
    g.moveTo(0, 78);
    g.lineTo(-15, 34);
    g.lineTo(-11, -38);
    g.lineTo(-4, -72);
    g.lineTo(0, -84);
    g.lineTo(4, -72);
    g.lineTo(11, -38);
    g.lineTo(15, 34);
    g.close();
    g.fill();

    g.fillColor = new Color(86, 220, 255, 255);
    g.moveTo(0, 70);
    g.lineTo(-8, 28);
    g.lineTo(-5, -42);
    g.lineTo(0, -68);
    g.lineTo(5, -42);
    g.lineTo(8, 28);
    g.close();
    g.fill();

    g.fillColor = new Color(184, 68, 255, 235);
    g.moveTo(0, 56);
    g.lineTo(-3, 14);
    g.lineTo(-1.6, -50);
    g.lineTo(0, -64);
    g.lineTo(1.6, -50);
    g.lineTo(3, 14);
    g.close();
    g.fill();

    g.fillColor = new Color(12, 20, 62, 255);
    g.circle(0, -12, 10);
    g.fill();
    g.strokeColor = new Color(104, 238, 255, 255);
    g.lineWidth = 3;
    g.circle(0, -12, 10);
    g.stroke();

    g.fillColor = new Color(245, 255, 255, 210);
    g.moveTo(-2, 60);
    g.lineTo(-5, 26);
    g.lineTo(-2, -34);
    g.lineTo(0, -52);
    g.lineTo(1.8, -34);
    g.lineTo(2.6, 22);
    g.close();
    g.fill();

    g.fillColor = new Color(255, 132, 36, 230);
    g.moveTo(0, -86);
    g.lineTo(-8, -66);
    g.lineTo(8, -66);
    g.close();
    g.fill();
  }
}
