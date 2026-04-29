import { _decorator, Color, Component, Label, Node, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { AudioKey } from './AudioKeys';

const { ccclass } = _decorator;

function hexColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return new Color(r, g, b, a);
}

@ccclass('FeedbackManager')
export class FeedbackManager extends Component {
  private floatNode: Node | null = null;
  private floatLabel: Label | null = null;
  private floatOpacity: UIOpacity | null = null;

  playAudio(key: AudioKey) {
    console.log(`[Audio] ${key}`);
  }

  floatText(text: string, color = '#fff0a8', y = 0) {
    const node = this.ensureFloatNode();
    const opacity = this.floatOpacity!;
    const label = this.floatLabel!;
    tween(node).stop();
    tween(opacity).stop();

    node.active = true;
    node.setScale(Vec3.ONE);
    node.setPosition(0, y, 0);
    opacity.opacity = 255;
    label.string = text;
    label.color = hexColor(color);

    tween(node)
      .parallel(
        tween().by(0.7, { position: new Vec3(0, 42, 0) }, { easing: 'quadOut' }),
        tween().to(0.12, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'quadOut' }).to(0.58, { scale: Vec3.ONE }),
      )
      .call(() => {
        node.active = false;
      })
      .start();
    tween(opacity).to(0.7, { opacity: 0 }).start();
  }

  private ensureFloatNode(): Node {
    if (this.floatNode && this.floatLabel && this.floatOpacity) return this.floatNode;
    const node = new Node('floatText');
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(500, 80);
    this.floatOpacity = node.addComponent(UIOpacity);
    this.floatLabel = node.addComponent(Label);
    this.floatLabel.fontSize = 34;
    this.floatLabel.lineHeight = 40;
    this.floatLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.floatLabel.verticalAlign = Label.VerticalAlign.CENTER;
    node.active = false;
    this.floatNode = node;
    return node;
  }
}
