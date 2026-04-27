import {
  _decorator,
  Color,
  Component,
  Graphics,
  HorizontalTextAlignment,
  Label,
  LabelOutline,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  Widget,
  resources,
  tween,
} from 'cc';
import { WesternSkin } from './SkinConfig';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
  @property(Label)
  public levelLabel: Label | null = null;

  @property(Label)
  public remainLabel: Label | null = null;

  @property(Node)
  public startPanel: Node | null = null;

  @property(Node)
  public losePanel: Node | null = null;

  @property(Node)
  public winPanel: Node | null = null;

  private _loadingPanel: Node | null = null;
  private _loadingBarFill: Node | null = null;
  private _loadingPercentLabel: Label | null = null;
  private _comboLabel: Label | null = null;
  private _comboOpacity: UIOpacity | null = null;

  private _onStart: (() => void) | null = null;
  private _onRestart: (() => void) | null = null;
  private _onNext: (() => void) | null = null;

  public init(onStart: () => void, onRestart: () => void, onNext: () => void): void {
    this._onStart = onStart;
    this._onRestart = onRestart;
    this._onNext = onNext;

    this.ensureRuntimeUI();
    this.bindButtons();
  }

  public setLevel(levelNumber: number): void {
    if (this.levelLabel) {
      this.levelLabel.string = `关卡 ${levelNumber}`;
    }
  }

  public setRemaining(remaining: number): void {
    if (this.remainLabel) {
      this.remainLabel.string = `剩余飞刀 ${remaining}`;
    }
  }

  public showCombo(comboCount: number): void {
    this.ensureComboLabel();

    if (!this._comboLabel || !this._comboOpacity) {
      return;
    }

    this._comboLabel.string = `Combo x${comboCount}`;
    this._comboOpacity.opacity = 255;
    this._comboLabel.node.setScale(0.92, 0.92, 1);

    Tween.stopAllByTarget(this._comboOpacity);
    Tween.stopAllByTarget(this._comboLabel.node);

    tween(this._comboLabel.node)
      .to(0.08, { scale: new Vec3(1.08, 1.08, 1) })
      .to(0.08, { scale: new Vec3(1, 1, 1) })
      .start();

    tween(this._comboOpacity)
      .delay(0.5)
      .to(0.2, { opacity: 0 })
      .start();
  }

  public showLoading(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));

    if (this._loadingPanel) {
      this._loadingPanel.active = true;
    }

    if (this._loadingBarFill) {
      const ui = this._loadingBarFill.getComponent(UITransform);
      if (ui) {
        ui.setContentSize(500 * p, 32);
      }
      this._loadingBarFill.setPosition(-250 + (500 * p) * 0.5, -202, 0);
    }

    if (this._loadingPercentLabel) {
      this._loadingPercentLabel.string = `加载中 ${Math.floor(p * 100)}%`;
    }

    this.setPanelVisible(this.startPanel, false);
    this.setPanelVisible(this.losePanel, false);
    this.setPanelVisible(this.winPanel, false);
  }

  public hideLoading(): void {
    if (this._loadingPanel) {
      this._loadingPanel.active = false;
    }
  }

  public showStartPanel(): void {
    this.hideLoading();
    this.setPanelVisible(this.startPanel, true);
    this.setPanelVisible(this.losePanel, false);
    this.setPanelVisible(this.winPanel, false);
  }

  public showPlayingHUD(): void {
    this.hideLoading();
    this.setPanelVisible(this.startPanel, false);
    this.setPanelVisible(this.losePanel, false);
    this.setPanelVisible(this.winPanel, false);
  }

  public showLosePanel(): void {
    this.hideLoading();
    this.setPanelVisible(this.startPanel, false);
    this.setPanelVisible(this.losePanel, true);
    this.setPanelVisible(this.winPanel, false);
  }

  public showWinPanel(): void {
    this.hideLoading();
    this.setPanelVisible(this.startPanel, false);
    this.setPanelVisible(this.losePanel, false);
    this.setPanelVisible(this.winPanel, true);
  }

  public setWinPanelContent(title: string, buttonText: string, buttonVisible: boolean): void {
    if (!this.winPanel) {
      return;
    }

    const titleNode = this.winPanel.getChildByName('Title');
    const titleLabel = titleNode?.getComponent(Label);
    if (titleLabel) {
      titleLabel.string = title;
    }

    const btn = this.winPanel.getChildByName('NextButton');
    if (btn) {
      btn.active = buttonVisible;
      const btnLabel = btn.getChildByName('Label')?.getComponent(Label);
      if (btnLabel) {
        btnLabel.string = buttonText;
      }
    }
  }

  private ensureRuntimeUI(): void {
    const topY = this.getTopHudY();
    const { levelX, remainX } = this.getHudXPositions();
    const levelChipWidth = 180;
    const remainChipWidth = 260;
    this.ensureHudDecor(topY, levelX, remainX, levelChipWidth, remainChipWidth);

    if (!this.levelLabel) {
      this.levelLabel = this.ensureTopLabel('LevelLabel', new Vec3(levelX, topY, 0), 34, HorizontalTextAlignment.CENTER, levelChipWidth);
    } else {
      this.levelLabel.node.setPosition(levelX, topY, 0);
      this.levelLabel.node.getComponent(UITransform)?.setContentSize(levelChipWidth, 64);
    }

    if (!this.remainLabel) {
      this.remainLabel = this.ensureTopLabel('RemainLabel', new Vec3(remainX, topY, 0), 34, HorizontalTextAlignment.CENTER, remainChipWidth);
    } else {
      this.remainLabel.node.setPosition(remainX, topY, 0);
      this.remainLabel.node.getComponent(UITransform)?.setContentSize(remainChipWidth, 64);
    }

    this.ensureComboLabel();

    this.startPanel = this.startPanel ?? this.ensurePanel('StartPanel', '西部飞刀', '开始挑战', 'StartButton', new Vec3(0, 0, 0));
    this.losePanel = this.losePanel ?? this.ensurePanel('LosePanel', '撞刀了！', '再来一把', 'RestartButton', new Vec3(0, 0, 0));
    this.winPanel = this.winPanel ?? this.ensurePanel('WinPanel', '完美命中！', '下一关', 'NextButton', new Vec3(0, 0, 0));
    this.ensureLoadingPanel();
    this.applyStartPanelBackground();
  }

  private ensureLoadingPanel(): void {
    let panel = this.node.getChildByName('LoadingPanel');
    if (!panel) {
      panel = new Node('LoadingPanel');
      this.node.addChild(panel);
    }
    panel.setPosition(0, 0, 0);
    panel.active = false;

    const panelUI = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    panelUI.setContentSize(680, 560);

    const bg = panel.getComponent(Graphics) ?? panel.addComponent(Graphics);
    this.drawPanel(bg, 680, 560);

    let title = panel.getChildByName('Title');
    if (!title) {
      title = new Node('Title');
      panel.addChild(title);
    }
    title.setPosition(0, 154, 0);
    const titleUI = title.getComponent(UITransform) ?? title.addComponent(UITransform);
    titleUI.setContentSize(560, 90);
    const titleLabel = title.getComponent(Label) ?? title.addComponent(Label);
    titleLabel.string = '西部飞刀';
    titleLabel.fontSize = 62;
    titleLabel.lineHeight = 70;
    titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    titleLabel.color = new Color(255, 238, 180, 255);
    const titleOutline = title.getComponent(LabelOutline) ?? title.addComponent(LabelOutline);
    titleOutline.color = new Color(59, 30, 16, 235);
    titleOutline.width = 2;

    let sub = panel.getChildByName('SubTitle');
    if (!sub) {
      sub = new Node('SubTitle');
      panel.addChild(sub);
    }
    sub.setPosition(0, 94, 0);
    const subUI = sub.getComponent(UITransform) ?? sub.addComponent(UITransform);
    subUI.setContentSize(560, 50);
    const subLabel = sub.getComponent(Label) ?? sub.addComponent(Label);
    subLabel.string = '正在准备资源';
    subLabel.fontSize = 30;
    subLabel.lineHeight = 36;
    subLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    subLabel.color = new Color(210, 223, 245, 255);

    let track = panel.getChildByName('LoadingTrack');
    if (!track) {
      track = new Node('LoadingTrack');
      panel.addChild(track);
    }
    track.setPosition(0, -202, 0);
    const trackUI = track.getComponent(UITransform) ?? track.addComponent(UITransform);
    trackUI.setContentSize(500, 32);
    const trackG = track.getComponent(Graphics) ?? track.addComponent(Graphics);
    trackG.clear();
    trackG.fillColor = new Color(54, 31, 20, 230);
    trackG.roundRect(-250, -16, 500, 32, 16);
    trackG.fill();
    trackG.strokeColor = new Color(152, 91, 44, 210);
    trackG.lineWidth = 1.2;
    trackG.roundRect(-250, -16, 500, 32, 16);
    trackG.stroke();
    const trackSprite = track.getComponent(Sprite) ?? track.addComponent(Sprite);
    trackSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.progressBackgroundSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !trackSprite.isValid) {
        return;
      }
      trackSprite.spriteFrame = sf;
    });

    let fill = panel.getChildByName('LoadingFill');
    if (!fill) {
      fill = new Node('LoadingFill');
      panel.addChild(fill);
    }
    fill.setPosition(-250, -202, 0);
    const fillUI = fill.getComponent(UITransform) ?? fill.addComponent(UITransform);
    fillUI.setContentSize(0, 32);
    const fillG = fill.getComponent(Graphics) ?? fill.addComponent(Graphics);
    fillG.clear();
    fillG.fillColor = new Color(219, 74, 45, 255);
    fillG.roundRect(0, -16, 500, 32, 16);
    fillG.fill();
    const fillSprite = fill.getComponent(Sprite) ?? fill.addComponent(Sprite);
    fillSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.progressFillSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !fillSprite.isValid) {
        return;
      }
      fillSprite.spriteFrame = sf;
    });

    let percent = panel.getChildByName('LoadingPercent');
    if (!percent) {
      percent = new Node('LoadingPercent');
      panel.addChild(percent);
    }
    percent.setPosition(0, -146, 0);
    const percentUI = percent.getComponent(UITransform) ?? percent.addComponent(UITransform);
    percentUI.setContentSize(420, 50);
    const percentLabel = percent.getComponent(Label) ?? percent.addComponent(Label);
    percentLabel.string = '加载中 0%';
    percentLabel.fontSize = 32;
    percentLabel.lineHeight = 38;
    percentLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    percentLabel.color = new Color(236, 245, 255, 255);

    this._loadingPanel = panel;
    this._loadingBarFill = fill;
    this._loadingPercentLabel = percentLabel;
  }

  private ensureHudDecor(topY: number, levelX: number, remainX: number, levelChipWidth: number, remainChipWidth: number): void {
    let hud = this.node.getChildByName('TopHUD');
    if (!hud) {
      hud = new Node('TopHUD');
      this.node.addChild(hud);
    }
    hud.setPosition(0, topY, 0);

    const hudUI = hud.getComponent(UITransform) ?? hud.addComponent(UITransform);
    const rootUI = this.node.getComponent(UITransform);
    const rootWidth = rootUI ? rootUI.width : 1170;
    const hudWidth = Math.max(740, rootWidth - 56);
    hudUI.setContentSize(hudWidth, 112);

    const g = hud.getComponent(Graphics) ?? hud.addComponent(Graphics);
    g.clear();

    this.drawHudChip(g, levelX, 0, levelChipWidth);
    this.drawHudChip(g, remainX, 0, remainChipWidth);

    hud.setSiblingIndex(Math.max(1, this.node.children.length - 1));
  }

  private drawHudChip(g: Graphics, x: number, y: number, width: number): void {
    const halfWidth = width * 0.5;
    const innerInset = 8;

    g.fillColor = new Color(0, 0, 0, 65);
    g.roundRect(x - halfWidth + 4, y - 34 - 4, width, 68, 18);
    g.fill();

    g.fillColor = new Color(82, 47, 26, 232);
    g.roundRect(x - halfWidth, y - 34, width, 68, 18);
    g.fill();

    g.fillColor = new Color(164, 92, 42, 105);
    g.roundRect(x - halfWidth + innerInset, y - 2, width - innerInset * 2, 30, 12);
    g.fill();

    g.fillColor = new Color(38, 34, 31, 255);
    g.circle(x - halfWidth + 18, y - 17, 5);
    g.circle(x + halfWidth - 18, y - 17, 5);
    g.circle(x - halfWidth + 18, y + 17, 5);
    g.circle(x + halfWidth - 18, y + 17, 5);
    g.fill();

    g.strokeColor = new Color(238, 166, 86, 170);
    g.lineWidth = 2;
    g.roundRect(x - halfWidth, y - 34, width, 68, 18);
    g.stroke();
  }

  private bindButtons(): void {
    this.bindPanelButton(this.startPanel, 'StartButton', () => this._onStart?.());
    this.bindPanelButton(this.losePanel, 'RestartButton', () => this._onRestart?.());
    this.bindPanelButton(this.winPanel, 'NextButton', () => this._onNext?.());
  }

  private bindPanelButton(panel: Node | null, btnName: string, onTap: () => void): void {
    if (!panel) {
      return;
    }

    const btn = panel.getChildByName(btnName);
    if (!btn) {
      return;
    }

    btn.off(Node.EventType.TOUCH_END);
    btn.on(Node.EventType.TOUCH_END, () => {
      onTap();
    });
  }

  private ensureTopLabel(name: string, pos: Vec3, fontSize: number, align: HorizontalTextAlignment, width = 300): Label {
    let node = this.node.getChildByName(name);
    if (!node) {
      node = new Node(name);
      this.node.addChild(node);
    }
    node.setPosition(pos);

    const ui = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    ui.setContentSize(width, 64);

    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = fontSize + 10;
    label.horizontalAlign = align;
    label.color = new Color(255, 236, 170, 255);

    const outline = node.getComponent(LabelOutline) ?? node.addComponent(LabelOutline);
    outline.color = new Color(49, 25, 15, 235);
    outline.width = 2;

    return label;
  }

  private ensureComboLabel(): void {
    let node = this.node.getChildByName('ComboLabel');
    if (!node) {
      node = new Node('ComboLabel');
      this.node.addChild(node);
    }

    const uiRoot = this.node.getComponent(UITransform);
    const topY = uiRoot ? uiRoot.height * 0.5 - 330 : 310;
    node.setPosition(0, topY, 0);
    node.setSiblingIndex(Math.max(1, this.node.children.length - 1));

    const ui = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    ui.setContentSize(420, 86);
    this.ensureComboBackground(node);

    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.string = '';
    label.fontSize = 44;
    label.lineHeight = 56;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.color = new Color(255, 245, 170, 255);

    const outline = node.getComponent(LabelOutline) ?? node.addComponent(LabelOutline);
    outline.color = new Color(60, 34, 15, 230);
    outline.width = 3;

    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    opacity.opacity = 0;

    this._comboLabel = label;
    this._comboOpacity = opacity;
  }

  private ensureComboBackground(node: Node): void {
    let bgNode = node.getChildByName('ComboBackground');
    if (!bgNode) {
      bgNode = new Node('ComboBackground');
      node.insertChild(bgNode, 0);
    }
    bgNode.setPosition(0, 0, 0);
    const ui = bgNode.getComponent(UITransform) ?? bgNode.addComponent(UITransform);
    ui.setContentSize(420, 110);
    const sprite = bgNode.getComponent(Sprite) ?? bgNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.comboBackgroundSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
    });
  }

  private ensurePanel(
    panelName: string,
    titleText: string,
    buttonText: string,
    buttonNodeName: string,
    pos: Vec3,
  ): Node {
    let panel = this.node.getChildByName(panelName);
    if (!panel) {
      panel = new Node(panelName);
      this.node.addChild(panel);
    }
    panel.setPosition(pos);

    const panelUI = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    panelUI.setContentSize(640, 430);

    const panelBg = panel.getComponent(Graphics) ?? panel.addComponent(Graphics);
    this.drawPanel(panelBg, 640, 430);
    this.ensurePanelSprite(panel, 640, 430);

    let titleNode = panel.getChildByName('Title');
    if (!titleNode) {
      titleNode = new Node('Title');
      panel.addChild(titleNode);
    }
    titleNode.setPosition(0, 118, 0);
    const titleUI = titleNode.getComponent(UITransform) ?? titleNode.addComponent(UITransform);
    titleUI.setContentSize(560, 96);
    const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
    titleLabel.string = titleText;
    titleLabel.fontSize = 56;
    titleLabel.lineHeight = 64;
    titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    titleLabel.color = new Color(255, 230, 160, 255);
    const titleOutline = titleNode.getComponent(LabelOutline) ?? titleNode.addComponent(LabelOutline);
    titleOutline.color = new Color(59, 30, 16, 235);
    titleOutline.width = 2;

    let btn = panel.getChildByName(buttonNodeName);
    if (!btn) {
      btn = new Node(buttonNodeName);
      panel.addChild(btn);
    }
    btn.setPosition(0, -126, 0);
    const btnUI = btn.getComponent(UITransform) ?? btn.addComponent(UITransform);
    btnUI.setContentSize(320, 102);
    const btnBg = btn.getComponent(Graphics) ?? btn.addComponent(Graphics);
    this.drawButton(btnBg, 320, 102);
    this.ensureButtonSprite(btn, 320, 102);

    let btnLabelNode = btn.getChildByName('Label');
    if (!btnLabelNode) {
      btnLabelNode = new Node('Label');
      btn.addChild(btnLabelNode);
    }
    btnLabelNode.setPosition(0, 0, 0);
    const btnLabelUI = btnLabelNode.getComponent(UITransform) ?? btnLabelNode.addComponent(UITransform);
    btnLabelUI.setContentSize(280, 76);
    const btnLabel = btnLabelNode.getComponent(Label) ?? btnLabelNode.addComponent(Label);
    btnLabel.string = buttonText;
    btnLabel.fontSize = 38;
    btnLabel.lineHeight = 46;
    btnLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
    btnLabel.color = new Color(255, 255, 255, 255);
    const btnOutline = btnLabelNode.getComponent(LabelOutline) ?? btnLabelNode.addComponent(LabelOutline);
    btnOutline.color = new Color(70, 36, 20, 235);
    btnOutline.width = 2;

    return panel;
  }

  private ensurePanelSprite(panel: Node, width: number, height: number): void {
    let spriteNode = panel.getChildByName('PanelSprite');
    if (!spriteNode) {
      spriteNode = new Node('PanelSprite');
      panel.insertChild(spriteNode, 0);
    }
    spriteNode.setPosition(0, 0, 0);
    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(width, height);
    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.panelSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
    });
  }

  private ensureButtonSprite(button: Node, width: number, height: number): void {
    let spriteNode = button.getChildByName('ButtonSprite');
    if (!spriteNode) {
      spriteNode = new Node('ButtonSprite');
      button.insertChild(spriteNode, 0);
    }
    spriteNode.setPosition(0, 0, 0);
    const ui = spriteNode.getComponent(UITransform) ?? spriteNode.addComponent(UITransform);
    ui.setContentSize(width, height);
    const sprite = spriteNode.getComponent(Sprite) ?? spriteNode.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(WesternSkin.buttonSprite, SpriteFrame, (err, sf) => {
      if (err || !sf || !sprite.isValid) {
        return;
      }
      sprite.spriteFrame = sf;
    });
  }

  private drawPanel(g: Graphics, width: number, height: number): void {
    g.clear();

    g.fillColor = new Color(0, 0, 0, 105);
    g.roundRect(-width * 0.5 + 8, -height * 0.5 - 8, width, height, 28);
    g.fill();

    g.fillColor = new Color(82, 46, 25, 236);
    g.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    g.fill();

    g.fillColor = new Color(158, 89, 42, 105);
    g.roundRect(-width * 0.5 + 12, -height * 0.5 + 12, width - 24, height * 0.48, 20);
    g.fill();

    for (let y = -height * 0.5 + 48; y < height * 0.5 - 36; y += 42) {
      g.strokeColor = new Color(52, 31, 20, 74);
      g.lineWidth = 1.4;
      g.moveTo(-width * 0.5 + 34, y);
      g.quadraticCurveTo(0, y + 14, width * 0.5 - 34, y - 6);
      g.stroke();
    }

    g.fillColor = new Color(43, 38, 34, 255);
    g.circle(-width * 0.5 + 34, -height * 0.5 + 34, 8);
    g.circle(width * 0.5 - 34, -height * 0.5 + 34, 8);
    g.circle(-width * 0.5 + 34, height * 0.5 - 34, 8);
    g.circle(width * 0.5 - 34, height * 0.5 - 34, 8);
    g.fill();

    g.strokeColor = new Color(236, 158, 75, 190);
    g.lineWidth = 2.4;
    g.roundRect(-width * 0.5, -height * 0.5, width, height, 28);
    g.stroke();
  }

  private drawButton(g: Graphics, width: number, height: number): void {
    g.clear();

    g.fillColor = new Color(0, 0, 0, 70);
    g.roundRect(-width * 0.5 + 4, -height * 0.5 - 5, width, height, 18);
    g.fill();

    g.fillColor = new Color(132, 73, 35, 255);
    g.roundRect(-width * 0.5, -height * 0.5, width, height, 18);
    g.fill();

    g.fillColor = new Color(236, 144, 64, 178);
    g.roundRect(-width * 0.5 + 10, 2, width - 20, height * 0.44, 14);
    g.fill();

    g.fillColor = new Color(45, 39, 35, 255);
    g.circle(-width * 0.5 + 24, -height * 0.5 + 24, 6);
    g.circle(width * 0.5 - 24, -height * 0.5 + 24, 6);
    g.circle(-width * 0.5 + 24, height * 0.5 - 24, 6);
    g.circle(width * 0.5 - 24, height * 0.5 - 24, 6);
    g.fill();

    g.strokeColor = new Color(255, 210, 145, 220);
    g.lineWidth = 1.8;
    g.roundRect(-width * 0.5, -height * 0.5, width, height, 18);
    g.stroke();
  }

  private setPanelVisible(panel: Node | null, visible: boolean): void {
    if (panel) {
      panel.active = visible;
    }
  }

  private applyStartPanelBackground(): void {
    if (!this.startPanel) {
      return;
    }

    let bgNode = this.startPanel.getChildByName('BgImage');
    if (!bgNode) {
      bgNode = new Node('BgImage');
      this.startPanel.insertChild(bgNode, 0);
    }
    bgNode.setPosition(0, 0, 0);

    const ui = bgNode.getComponent(UITransform) ?? bgNode.addComponent(UITransform);
    ui.setContentSize(640, 430);

    const widget = bgNode.getComponent(Widget) ?? bgNode.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;

    const sp = bgNode.getComponent(Sprite) ?? bgNode.addComponent(Sprite);
    sp.sizeMode = Sprite.SizeMode.CUSTOM;
    sp.color = new Color(255, 255, 255, 188);

    resources.load(WesternSkin.loadingBackground, SpriteFrame, (err, sf) => {
      if (err || !sf || !sp.isValid) {
        return;
      }
      sp.spriteFrame = sf;
    });
  }

  private getTopHudY(): number {
    const ui = this.node.getComponent(UITransform);
    const h = ui ? ui.height : 1280;
    return h * 0.5 - 208;
  }

  private getHudXPositions(): { levelX: number; remainX: number } {
    const ui = this.node.getComponent(UITransform);
    const w = ui ? ui.width : 1170;
    const half = w * 0.5;
    const levelChipHalfWidth = 90;
    const sideInset = 20;
    return {
      levelX: -half + levelChipHalfWidth + sideInset,
      remainX: 0,
    };
  }
}
