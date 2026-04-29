import { _decorator, Color, Component, Label, Node, UITransform, Vec3, tween } from 'cc';
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
  playAudio(key: AudioKey) {
    console.log(`[Audio] ${key}`);
  }

  floatText(text: string, color = '#fff0a8', y = 0) {
    const node = new Node('floatText');
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(500, 80);
    node.setPosition(0, y, 0);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = 34;
    label.lineHeight = 40;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.color = hexColor(color);
    tween(node).to(0.18, { scale: new Vec3(1.08, 1.08, 1) }).to(0.45, { position: new Vec3(0, y + 80, 0) }).call(() => node.destroy()).start();
  }
}
