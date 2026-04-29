import { _decorator, Button, Color, Component, Graphics, ImageAsset, Label, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, UITransform, Vec3 } from 'cc';

const { ccclass } = _decorator;

function hexColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return new Color(r, g, b, a);
}

@ccclass('UIManager')
export class UIManager extends Component {
  loadingLayer!: Node;
  homeLayer!: Node;
  gameLayer!: Node;
  popupLayer!: Node;
  boardHost!: Node;
  goalsLabel!: Label;
  movesLabel!: Label;
  energyFill!: Node;
  private loadingFill!: Node;
  private loadingLabel!: Label;

  onStartGame: (() => void) | null = null;
  onNextLevel: (() => void) | null = null;
  onRetry: (() => void) | null = null;
  onHome: (() => void) | null = null;

  build() {
    this.node.removeAllChildren();
    this.loadingLayer = this.layer('loading');
    this.homeLayer = this.layer('home');
    this.gameLayer = this.layer('game');
    this.popupLayer = this.layer('popup');
    this.popupLayer.active = false;
    this.buildLoading();
    this.buildHome();
    this.buildGame();
    this.showLoading(0);
  }

  showLoading(progress: number) {
    this.loadingLayer.active = true;
    this.homeLayer.active = false;
    this.gameLayer.active = false;
    this.popupLayer.active = false;
    if (this.loadingFill) this.loadingFill.setScale(new Vec3(Math.max(0.02, progress), 1, 1));
    if (this.loadingLabel) this.loadingLabel.string = `加载中 ${Math.floor(progress * 100)}%`;
  }

  showHome() {
    this.loadingLayer.active = false;
    this.homeLayer.active = true;
    this.gameLayer.active = false;
    this.popupLayer.active = false;
  }

  showGame() {
    this.loadingLayer.active = false;
    this.homeLayer.active = false;
    this.gameLayer.active = true;
    this.popupLayer.active = false;
  }

  updateHud(level: number, moves: number, goals: string[], energyPercent: number) {
    this.movesLabel.string = `第${level}关  步数 ${moves}`;
    this.goalsLabel.string = goals.join('\n');
    this.energyFill.setScale(new Vec3(Math.max(0.02, energyPercent), 1, 1));
  }

  showResult(win: boolean, score: number, level: number) {
    this.popupLayer.removeAllChildren();
    this.popupLayer.active = true;
    const panel = this.panel(this.popupLayer, 520, 430, '#f7eaffee');
    panel.setPosition(0, 0, 0);
    const title = win && level === 10 ? '小幸运回来了' : win ? '关卡完成！' : '没关系，再试一次。';
    this.text(panel, title, 42, 0, 145, '#664c9e');
    this.text(panel, win ? '今天的心情亮了一点。' : '今天也已经很努力了。', 26, 0, 75, '#6f6390');
    this.text(panel, win ? '★ ★ ★' : '☆ ☆ ☆', 58, 0, 5, win ? '#ffd15b' : '#b8add2');
    this.text(panel, `得分 ${score}`, 26, 0, -58, '#4d4272');
    this.button(panel, win ? '下一关' : '再来一次', -110, -145, '#9bdd7a', () => (win ? this.onNextLevel?.() : this.onRetry?.()));
    this.button(panel, '返回主页', 110, -145, '#a88ee8', () => this.onHome?.());
  }

  private buildLoading() {
    this.loadBg(this.loadingLayer, 'bg/bg_home_night');
    this.text(this.loadingLayer, '情绪消消乐', 56, 0, 190, '#ffffff');
    this.text(this.loadingLayer, '把坏心情轻轻放下', 26, 0, 120, '#fff6c9');
    const track = this.panel(this.loadingLayer, 430, 24, '#e8def5cc');
    track.setPosition(0, -80, 0);
    this.loadingFill = this.panel(track, 420, 16, '#ffd96b');
    this.loadingFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    this.loadingFill.setPosition(-210, 0, 0);
    this.loadingLabel = this.text(this.loadingLayer, '加载中 0%', 22, 0, -130, '#ffffff');
  }

  private buildHome() {
    this.loadBg(this.homeLayer, 'bg/bg_home_night');
    this.button(this.homeLayer, '开始游戏', 0, -250, '#9bdd7a', () => this.onStartGame?.());
    this.button(this.homeLayer, '当前关卡', 0, -330, '#a88ee8', () => this.onStartGame?.());
    this.iconButton(this.homeLayer, '⚙', -245, 535);
    this.iconButton(this.homeLayer, '♪', 245, 535);
  }

  private buildGame() {
    this.loadBg(this.gameLayer, 'bg/bg_level_night');
    const top = this.panel(this.gameLayer, 640, 150, '#f4edffee');
    top.setPosition(0, 510, 0);
    this.movesLabel = this.text(top, '第1关  步数 25', 32, 0, 42, '#554287');
    this.goalsLabel = this.text(top, '', 24, -180, -28, '#554287');
    this.text(top, '情绪能量', 20, 165, -8, '#66558d');
    const bar = this.panel(top, 210, 22, '#d8cced');
    bar.setPosition(165, -40, 0);
    this.energyFill = this.panel(bar, 200, 14, '#ffd96b');
    this.energyFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    this.energyFill.setPosition(-100, 0, 0);

    const boardPanel = this.panel(this.gameLayer, 642, 642, '#151c4cbb');
    boardPanel.setPosition(0, 35, 0);

    this.boardHost = new Node('BoardHost');
    this.boardHost.parent = this.gameLayer;
    this.boardHost.addComponent(UITransform).setContentSize(608, 608);
    this.boardHost.setPosition(0, 35, 0);

    const bottom = this.panel(this.gameLayer, 640, 112, '#f4edffee');
    bottom.setPosition(0, -440, 0);
    this.button(bottom, '星星', -200, 0, '#ffe07a', () => null);
    this.button(bottom, '锤子', 0, 0, '#ffb06d', () => null);
    this.button(bottom, '暂停', 200, 0, '#a88ee8', () => this.showHome());
  }

  private layer(name: string): Node {
    const node = new Node(name);
    node.parent = this.node;
    node.addComponent(UITransform).setContentSize(720, 1280);
    return node;
  }

  private panel(parent: Node, width: number, height: number, color: string): Node {
    const node = new Node('panel');
    node.parent = parent;
    node.addComponent(UITransform).setContentSize(width, height);
    this.drawRect(node, width, height, color);
    return node;
  }

  private text(parent: Node, value: string, size: number, x: number, y: number, color: string): Label {
    const node = new Node('text');
    node.parent = parent;
    node.addComponent(UITransform).setContentSize(580, 90);
    node.setPosition(x, y, 0);
    const label = node.addComponent(Label);
    label.string = value;
    label.fontSize = size;
    label.lineHeight = size + 8;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = hexColor(color);
    return label;
  }

  private button(parent: Node, label: string, x: number, y: number, color: string, handler: () => void) {
    const node = this.panel(parent, 180, 58, color);
    node.name = `button_${label}`;
    node.setPosition(x, y, 0);
    node.addComponent(Button);
    node.on(Button.EventType.CLICK, handler, this);
    this.text(node, label, 24, 0, 0, '#ffffff');
  }

  private iconButton(parent: Node, label: string, x: number, y: number) {
    const node = this.panel(parent, 64, 64, '#ffffff55');
    node.setPosition(x, y, 0);
    this.text(node, label, 30, 0, 0, '#ffffff');
  }

  private loadBg(parent: Node, path: string) {
    const bg = this.panel(parent, 720, 1280, '#231b45');
    bg.name = 'background';
    bg.setSiblingIndex(0);
    const image = this.imageNode(bg, 720, 1280);
    this.loadSpriteFrame(path, (frame) => {
      if (frame) {
        image.getComponent(Sprite)!.spriteFrame = frame;
        return;
      }

      if (path !== 'source/emotion_design') {
        this.loadSpriteFrame('source/emotion_design', (sourceFrame) => {
          if (sourceFrame) image.getComponent(Sprite)!.spriteFrame = sourceFrame;
        });
      }
    });
  }

  private drawRect(node: Node, width: number, height: number, color: string) {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = hexColor(color);
    graphics.roundRect(-width / 2, -height / 2, width, height, Math.min(22, height / 4));
    graphics.fill();
  }

  private loadSpriteFrame(path: string, done: (frame: SpriteFrame | null) => void) {
    resources.load(path, SpriteFrame, (plainFrameErr, plainFrame) => {
      if (!plainFrameErr && plainFrame) {
        done(plainFrame);
        return;
      }

      resources.load(`${path}/spriteFrame`, SpriteFrame, (frameErr, frame) => {
        if (!frameErr && frame) {
          done(frame);
          return;
        }

        resources.load(`${path}/texture`, Texture2D, (textureErr, texture) => {
          if (!textureErr && texture) {
            done(this.frameFromTexture(texture));
            return;
          }

          resources.load(path, ImageAsset, (imageErr, imageAsset) => {
            if (!imageErr && imageAsset) {
              const runtimeTexture = new Texture2D();
              runtimeTexture.image = imageAsset;
              done(this.frameFromTexture(runtimeTexture));
              return;
            }

            resources.load(path, Texture2D, (baseErr, baseTexture) => {
              if (!baseErr && baseTexture) {
                done(this.frameFromTexture(baseTexture));
                return;
              }
              console.warn(`[UIManager] image load failed: ${path}`, frameErr || textureErr || imageErr || baseErr);
              done(null);
            });
          });
        });
      });
    });
  }

  private frameFromTexture(texture: Texture2D): SpriteFrame {
    const width = texture.width || 1;
    const height = texture.height || 1;
    const frame = new SpriteFrame();
    frame.reset({
      texture,
      originalSize: new Size(width, height),
      rect: new Rect(0, 0, width, height),
    });
    return frame;
  }

  private imageNode(parent: Node, width: number, height: number): Node {
    const node = new Node('image');
    node.parent = parent;
    node.addComponent(UITransform).setContentSize(width, height);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);
    return node;
  }
}
