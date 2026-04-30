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

type ButtonParts = { node: Node; button: Button; label: Label; color: string };

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
  private startButton!: ButtonParts;
  private continueButton!: ButtonParts;
  private starButton!: ButtonParts;
  private hammerButton!: ButtonParts;

  onStartGame: (() => void) | null = null;
  onRestartFromFirst: (() => void) | null = null;
  onContinueGame: (() => void) | null = null;
  onNextLevel: (() => void) | null = null;
  onRetry: (() => void) | null = null;
  onHome: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onPauseHome: (() => void) | null = null;
  onStar: (() => void) | null = null;
  onHammer: (() => void) | null = null;
  onDevCornerTap: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onToggleMusic: (() => void) | null = null;
  onToggleSfx: (() => void) | null = null;
  onButtonClick: (() => void) | null = null;

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

  updateHomeSaveState(hasProgress: boolean) {
    if (!this.continueButton || !this.startButton) return;
    this.startButton.button.interactable = !hasProgress;
    this.paintButton(this.startButton, hasProgress ? '#8f8a9a' : '#9bdd7a');
    this.continueButton.button.interactable = hasProgress;
    this.continueButton.label.string = hasProgress ? '继续游戏' : '暂无进度';
    this.paintButton(this.continueButton, hasProgress ? '#a88ee8' : '#8f8a9a');
  }

  updateHud(level: number, moves: number, goals: string[], energyPercent: number) {
    this.movesLabel.string = `第${level}关  步数 ${moves}`;
    this.goalsLabel.string = goals.join('\n');
    this.goalsLabel.fontSize = goals.length >= 5 ? 18 : goals.length >= 4 ? 20 : 23;
    this.goalsLabel.lineHeight = goals.length >= 5 ? 21 : goals.length >= 4 ? 24 : 30;
    this.energyFill.setScale(new Vec3(Math.max(0.02, energyPercent), 1, 1));
  }

  updateTools(starCount: number, hammerCount: number, activeTool: 'star' | 'hammer' | null) {
    this.setToolButton(this.starButton, `星星 x${starCount}`, starCount > 0, activeTool === 'star', '#ffe07a');
    this.setToolButton(this.hammerButton, `锤子 x${hammerCount}`, hammerCount > 0, activeTool === 'hammer', '#ffb06d');
  }

  showTutorial(title: string, body: string, onClose: () => void) {
    this.popupLayer.removeAllChildren();
    this.popupLayer.active = true;
    const panel = this.panel(this.popupLayer, 560, 430, '#f7eafff4');
    panel.setPosition(0, 0, 0);
    this.text(panel, title, 40, 0, 140, '#664c9e');
    const label = this.text(panel, body, 25, 0, 25, '#5d527c');
    label.node.getComponent(UITransform)?.setContentSize(460, 180);
    label.overflow = Label.Overflow.SHRINK;
    this.button(panel, '我知道了', 0, -145, '#9bdd7a', onClose);
  }

  showPause() {
    this.popupLayer.removeAllChildren();
    this.popupLayer.active = true;
    const panel = this.panel(this.popupLayer, 520, 440, '#f7eafff4');
    panel.setPosition(0, 0, 0);
    this.text(panel, '游戏暂停', 42, 0, 145, '#664c9e');
    this.button(panel, '继续游戏', 0, 55, '#9bdd7a', () => this.onResume?.());
    this.button(panel, '重新开始本关', 0, -25, '#ffb06d', () => this.onRestart?.());
    this.button(panel, '返回主页', 0, -105, '#a88ee8', () => this.onPauseHome?.());
  }

  showSettings(musicEnabled: boolean, sfxEnabled: boolean) {
    this.popupLayer.removeAllChildren();
    this.popupLayer.active = true;
    const panel = this.panel(this.popupLayer, 500, 390, '#f7eafff4');
    panel.setPosition(0, 0, 0);
    this.text(panel, '设置', 42, 0, 125, '#664c9e');
    this.button(panel, musicEnabled ? '音乐：开' : '音乐：关', 0, 40, musicEnabled ? '#9bdd7a' : '#8f8a9a', () => this.onToggleMusic?.());
    this.button(panel, sfxEnabled ? '音效：开' : '音效：关', 0, -35, sfxEnabled ? '#ffe07a' : '#8f8a9a', () => this.onToggleSfx?.());
    this.button(panel, '关闭', 0, -120, '#a88ee8', () => this.hidePopup());
  }

  hidePopup() {
    this.popupLayer.active = false;
    this.popupLayer.removeAllChildren();
  }

  showResult(win: boolean, score: number, level: number, maxLevel = 20) {
    this.popupLayer.removeAllChildren();
    this.popupLayer.active = true;
    const chapterEnd = win && level >= maxLevel;
    const panel = this.panel(this.popupLayer, chapterEnd ? 600 : 540, chapterEnd ? 540 : 440, '#f7eaffee');
    panel.setPosition(0, 0, 0);
    const title = chapterEnd ? '坏心情已清理完成！' : win ? '关卡完成' : '还差一点';
    const titleLabel = this.text(panel, title, chapterEnd ? 38 : 42, 0, chapterEnd ? 185 : 145, '#664c9e');
    titleLabel.node.getComponent(UITransform)?.setContentSize(460, 70);
    const message = chapterEnd ? '你消除了烦躁、焦虑、压力、低落和坏运气。\n也重新找回了一点点好心情。\n\n明天也许还会有新的情绪，\n但今天，已经做得很好了。' : win ? '今天的心情亮了一点。' : '没关系，再试一次。';
    const messageLabel = this.text(panel, message, chapterEnd ? 23 : 24, 0, chapterEnd ? 76 : 72, '#6f6390');
    messageLabel.lineHeight = 32;
    messageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    messageLabel.node.getComponent(UITransform)?.setContentSize(chapterEnd ? 520 : 460, chapterEnd ? 190 : 80);
    this.text(panel, win ? '★ ★ ★' : '☆ ☆ ☆', chapterEnd ? 48 : 56, 0, chapterEnd ? -68 : 5, win ? '#ffd15b' : '#b8add2');
    this.text(panel, `得分 ${score}`, 25, 0, chapterEnd ? -125 : -58, '#4d4272');
    if (chapterEnd) {
      this.button(panel, '返回首页', -110, -200, '#a88ee8', () => this.onHome?.());
      this.button(panel, '重新挑战第30关', 110, -200, '#9bdd7a', () => this.onRetry?.());
      return;
    }
    this.button(panel, win ? '继续下一关' : '重新开始', -110, -145, '#9bdd7a', () => (win ? this.onNextLevel?.() : this.onRetry?.()));
    this.button(panel, '返回主页', 110, -145, '#a88ee8', () => this.onHome?.());
  }

  private buildLoading() {
    this.loadBg(this.loadingLayer, 'bg/bg_home_clear');
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
    this.loadBg(this.homeLayer, 'bg/bg_home_clear');
    this.text(this.homeLayer, '情绪消消乐', 48, 0, -10, '#fff7d8');
    this.startButton = this.button(this.homeLayer, '开始游戏', 0, -220, '#9bdd7a', () => this.onStartGame?.());
    this.continueButton = this.button(this.homeLayer, '暂无进度', 0, -292, '#a88ee8', () => this.onContinueGame?.());
    this.button(this.homeLayer, '重新开始', 0, -364, '#ffb06d', () => this.onRestartFromFirst?.());
    this.iconButton(this.homeLayer, '⚙', -245, 535, () => this.onSettings?.());
    this.iconButton(this.homeLayer, '♪', 245, 535, () => this.onSettings?.());
  }

  private buildGame() {
    this.loadBg(this.gameLayer, 'bg/bg_level_night');
    const top = this.panel(this.gameLayer, 660, 172, '#f4edffee');
    top.setPosition(0, 510, 0);
    this.movesLabel = this.text(top, '第1关  步数 24', 32, 0, 50, '#554287');
    this.goalsLabel = this.text(top, '', 23, -140, -30, '#554287');
    this.goalsLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.goalsLabel.lineHeight = 30;
    this.goalsLabel.overflow = Label.Overflow.SHRINK;
    this.goalsLabel.node.getComponent(UITransform)?.setContentSize(300, 130);
    this.text(top, '情绪能量', 20, 165, -8, '#66558d');
    const bar = this.panel(top, 210, 22, '#d8cced');
    bar.setPosition(165, -40, 0);
    this.energyFill = this.panel(bar, 200, 14, '#ffd96b');
    this.energyFill.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
    this.energyFill.setPosition(-100, 0, 0);

    const boardPanel = this.panel(this.gameLayer, 642, 642, '#151c4cbb');
    boardPanel.setPosition(0, 100, 0);

    this.boardHost = new Node('BoardHost');
    this.boardHost.parent = this.gameLayer;
    this.boardHost.addComponent(UITransform).setContentSize(608, 608);
    this.boardHost.setPosition(0, 100, 0);

    const bottom = this.panel(this.gameLayer, 640, 112, '#f4edffee');
    bottom.setPosition(0, -270, 0);
    const devHotspot = this.panel(this.gameLayer, 132, 132, '#00000001');
    devHotspot.name = 'devSkipHotspot';
    devHotspot.setPosition(-294, 574, 0);
    devHotspot.addComponent(Button);
    devHotspot.on(Button.EventType.CLICK, () => this.onDevCornerTap?.(), this);
    devHotspot.setSiblingIndex(999);
    this.starButton = this.button(bottom, '星星 x1', -200, 0, '#ffe07a', () => this.onStar?.());
    this.hammerButton = this.button(bottom, '锤子 x1', 0, 0, '#ffb06d', () => this.onHammer?.());
    this.button(bottom, '暂停', 200, 0, '#a88ee8', () => this.onPause?.());
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

  private button(parent: Node, label: string, x: number, y: number, color: string, handler: () => void): ButtonParts {
    const node = this.panel(parent, 180, 58, color);
    node.name = `button_${label}`;
    node.setPosition(x, y, 0);
    const button = node.addComponent(Button);
    node.on(Button.EventType.CLICK, () => {
      this.onButtonClick?.();
      handler();
    }, this);
    const text = this.text(node, label, 24, 0, 0, '#ffffff');
    return { node, button, label: text, color };
  }

  private iconButton(parent: Node, label: string, x: number, y: number, handler?: () => void) {
    const node = this.panel(parent, 64, 64, '#ffffff55');
    node.setPosition(x, y, 0);
    if (handler) {
      node.addComponent(Button);
      node.on(Button.EventType.CLICK, () => {
        this.onButtonClick?.();
        handler();
      }, this);
    }
    this.text(node, label, 30, 0, 0, '#ffffff');
  }

  private setToolButton(parts: ButtonParts, label: string, enabled: boolean, active: boolean, color: string) {
    if (!parts) return;
    parts.button.interactable = true;
    parts.label.string = label;
    this.paintButton(parts, !enabled ? '#8f8a9a' : active ? '#9bdd7a' : color);
  }

  private paintButton(parts: ButtonParts, color: string) {
    parts.color = color;
    const transform = parts.node.getComponent(UITransform)!;
    this.drawRect(parts.node, transform.width, transform.height, color);
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
