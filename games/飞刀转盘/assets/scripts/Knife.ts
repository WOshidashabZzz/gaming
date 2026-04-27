import { _decorator, Color, Component, Graphics, Node, Tween, tween, UITransform, Vec3 } from 'cc';
import { Sprite, SpriteFrame, UIOpacity, resources } from 'cc';
import { WesternSkin } from './SkinConfig';

const { ccclass, property } = _decorator;

@ccclass('Knife')
export class Knife extends Component {
  @property
  public flySpeed = 1200;

  private _isFlying = false;
  private _targetY = 0;
  private _dangerWarning = false;
  private _dangerTime = 0;
  private _opacity: UIOpacity | null = null;
  private _knifeSprite: Sprite | null = null;

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
    this.setDangerWarning(false);

    Tween.stopAllByTarget(this.node);
    const side = Math.random() > 0.5 ? 1 : -1;
    tween(this.node)
      .by(0.35, {
        position: new Vec3(140 * side, -520, 0),
        angle: 120 * side,
      })
      .start();
  }

  public setDangerWarning(enabled: boolean): void {
    if (this._dangerWarning === enabled) {
      return;
    }

    this._dangerWarning = enabled;
    this._dangerTime = 0;

    if (!enabled && this._opacity) {
      this._opacity.opacity = 255;
    }
  }

  protected update(dt: number): void {
    const scaledDt = dt * this.getFallbackTimeScale();
    this.updateDangerWarning(scaledDt);

    if (!this._isFlying) {
      return;
    }

    const pos = this.node.worldPosition;
    const nextY = pos.y + this.flySpeed * scaledDt;

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
    ui.setContentSize(36, 134);
    ui.setAnchorPoint(0.5, 0.18);

    this._opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    this._opacity.opacity = 255;

    const g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.drawArrow(g);
    this.ensureKnifeSprite(g);
  }

  private ensureKnifeSprite(fallbackGraphics: Graphics): void {
    let spriteNode = this.node.getChildByName('KnifeSprite');
    if (!spriteNode) {
      spriteNode = new Node('KnifeSprite');
      this.node.addChild(spriteNode);
    }
    spriteNode.setPosition(0, 0, 0);
    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(48, 132);
    ui.setAnchorPoint(0.5, 0.18);

    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this._knifeSprite = sprite;

    resources.load(WesternSkin.knifeSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
      fallbackGraphics.clear();
    });
  }

  private updateDangerWarning(dt: number): void {
    if (!this._opacity || this._isFlying) {
      return;
    }

    if (!this._dangerWarning) {
      if (this._opacity.opacity !== 255) {
        this._opacity.opacity = 255;
      }
      return;
    }

    this._dangerTime += dt;
    const wave = (Math.sin(this._dangerTime * 12) + 1) * 0.5;
    this._opacity.opacity = 128 + Math.floor(wave * 127);
  }

  private getFallbackTimeScale(): number {
    return (globalThis as unknown as { __flyKnifeTimeScale?: number }).__flyKnifeTimeScale ?? 1;
  }

  private drawArrow(g: Graphics): void {
    g.clear();

    // 箭杆阴影
    g.fillColor = new Color(0, 0, 0, 65);
    g.roundRect(-3.2, -53, 7, 86, 2);
    g.fill();

    // 箭杆主体
    g.fillColor = new Color(170, 124, 76, 255);
    g.roundRect(-2.6, -52, 5.2, 84, 2);
    g.fill();

    // 箭杆高光
    g.fillColor = new Color(222, 188, 132, 185);
    g.roundRect(-1.2, -48, 1.7, 72, 1);
    g.fill();

    // 箭头外轮廓
    g.fillColor = new Color(115, 130, 156, 235);
    g.moveTo(0, 62);
    g.lineTo(-8.5, 30);
    g.lineTo(8.5, 30);
    g.close();
    g.fill();

    // 箭头主体
    g.fillColor = new Color(214, 224, 242, 255);
    g.moveTo(0, 59);
    g.lineTo(-6.6, 31.8);
    g.lineTo(6.6, 31.8);
    g.close();
    g.fill();

    // 箭头高光
    g.fillColor = new Color(255, 255, 255, 140);
    g.moveTo(0, 53);
    g.lineTo(-2.4, 40);
    g.lineTo(2.4, 40);
    g.close();
    g.fill();

    // 箭羽左
    g.fillColor = new Color(200, 76, 76, 245);
    g.moveTo(-2.6, -41);
    g.lineTo(-13, -54);
    g.lineTo(-2.6, -58);
    g.close();
    g.fill();
    g.fillColor = new Color(245, 150, 150, 130);
    g.moveTo(-3.8, -44);
    g.lineTo(-10.2, -52.2);
    g.lineTo(-3.8, -53.8);
    g.close();
    g.fill();

    // 箭羽右
    g.fillColor = new Color(80, 132, 224, 245);
    g.moveTo(2.6, -41);
    g.lineTo(13, -54);
    g.lineTo(2.6, -58);
    g.close();
    g.fill();
    g.fillColor = new Color(160, 200, 255, 130);
    g.moveTo(3.8, -44);
    g.lineTo(10.2, -52.2);
    g.lineTo(3.8, -53.8);
    g.close();
    g.fill();

    // 箭尾凹口
    g.strokeColor = new Color(70, 50, 35, 255);
    g.lineWidth = 1.7;
    g.moveTo(-2.6, -52);
    g.lineTo(0, -57);
    g.lineTo(2.6, -52);
    g.stroke();
  }
}
