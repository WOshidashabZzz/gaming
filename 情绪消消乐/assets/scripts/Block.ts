import { _decorator, Color, Component, Graphics, ImageAsset, Label, LabelOutline, Node, Rect, resources, Size, Sprite, SpriteFrame, Texture2D, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import { BLOCK_COLORS, CellState, SpecialType } from './GameTypes';

const { ccclass } = _decorator;
const loggedLoadedSprites = new Set<string>();
const loggedMissingSprites = new Set<string>();

function hexColor(hex: string): Color {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length >= 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return new Color(r, g, b, a);
}

@ccclass('Block')
export class Block extends Component {
  state: CellState | null = null;
  private imageSprite: Sprite | null = null;
  private badge: Label | null = null;

  setup(state: CellState, size: number) {
    this.state = state;
    this.node.name = `block_${state.row}_${state.col}`;
    this.node.setScale(Vec3.ONE);
    const opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    opacity.opacity = 255;
    this.node.getComponent(UITransform)?.setContentSize(size, size);
    this.drawBlock(size, BLOCK_COLORS[state.type]);

    this.imageSprite = this.ensureImage(size).getComponent(Sprite)!;
    this.imageSprite.spriteFrame = null;
    this.loadSprite(state);

    this.hideLabel('name');

    this.badge = this.ensureLabel('badge', 25, size * 0.22);
    this.badge.string = this.getBadgeText(state.special);
    this.badge.color = hexColor('#ffffff');
    this.applyOutline(this.badge, '#5b3d91', 2);
  }

  setSelected(selected: boolean) {
    tween(this.node).to(0.08, { scale: selected ? new Vec3(1.08, 1.08, 1) : Vec3.ONE }, { easing: 'quadOut' }).start();
  }

  playClear(): Promise<void> {
    const opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    opacity.opacity = 255;
    return new Promise((resolve) => {
      tween(this.node)
        .to(0.08, { scale: new Vec3(1.12, 1.12, 1) }, { easing: 'quadOut' })
        .to(0.14, { scale: new Vec3(0.05, 0.05, 1) }, { easing: 'quadIn' })
        .call(() => resolve())
        .start();
      tween(opacity).to(0.22, { opacity: 0 }).start();
    });
  }

  private ensureLabel(name: string, size: number, y: number): Label {
    let child = this.node.getChildByName(name);
    if (!child) {
      child = new Node(name);
      child.parent = this.node;
      child.addComponent(UITransform).setContentSize(86, 32);
    }
    child.setPosition(0, y, 0);
    const label = child.getComponent(Label) ?? child.addComponent(Label);
    label.fontSize = size;
    label.lineHeight = size + 3;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    return label;
  }

  private hideLabel(name: string) {
    const child = this.node.getChildByName(name);
    if (!child) return;
    const label = child.getComponent(Label);
    if (label) label.string = '';
    child.active = false;
  }

  private applyOutline(label: Label, color: string, width: number) {
    const outline = label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
    outline.color = hexColor(color);
    outline.width = width;
  }

  private loadSprite(state: CellState) {
    const requestedType = state.type;
    const path = `blocks/block_${requestedType}`;
    this.loadSpriteFrame(path, (frame) => {
      if (frame && this.imageSprite && this.state === state && this.state.type === requestedType) {
        if (!loggedLoadedSprites.has(requestedType)) {
          loggedLoadedSprites.add(requestedType);
          console.log('[BlockSpriteLoaded]', requestedType, true);
        }
        this.imageSprite.spriteFrame = frame;
        this.node.getComponent(Graphics)?.clear();
        return;
      }

      if (!frame && !loggedMissingSprites.has(requestedType)) {
        loggedMissingSprites.add(requestedType);
        console.error('[BlockSpriteMissing]', requestedType);
      }
    });
  }

  private drawBlock(size: number, color: string) {
    const graphics = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = hexColor(color);
    graphics.roundRect(-size / 2, -size / 2, size, size, 14);
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
              console.warn(`[Block] image load failed: ${path}`, frameErr || textureErr || imageErr || baseErr);
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

  private ensureImage(size: number): Node {
    let image = this.node.getChildByName('image');
    if (!image) {
      image = new Node('image');
      image.parent = this.node;
      image.addComponent(UITransform);
      image.addComponent(Sprite);
    }
    image.getComponent(UITransform)!.setContentSize(size, size);
    const sprite = image.getComponent(Sprite)!;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, 255);
    return image;
  }

  private getBadgeText(special: SpecialType): string {
    if (special === SpecialType.Row) return '→';
    if (special === SpecialType.Column) return '↓';
    if (special === SpecialType.Bomb) return '✦';
    if (special === SpecialType.Rainbow) return '◎';
    if (special === SpecialType.LuckyStar) return '★';
    return '';
  }
}
