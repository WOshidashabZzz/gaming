# 包体优化报告

## 当前资源扫描

### 图片

| 文件 | 大小 |
| --- | ---: |
| `assets/resources/meteor/bg_game_meteor.jpg` | 119.8 KB |
| `assets/resources/meteor/bg_loading_meteor.jpg` | 36.9 KB |

### 音频

当前 `assets` 下没有音频文件。

### Prefab

当前 `assets` 下没有 prefab 文件。

### JSON / Scene

| 文件 | 大小 |
| --- | ---: |
| `assets/scene.scene` | 15.9 KB |

## 可能未引用资源

已移出运行包：

| 文件 | 原位置 | 新位置 | 原因 |
| --- | --- | --- | --- |
| `app_icon.png` | `assets/resources/branding` | `docs/branding_assets` | 上架素材，运行时未引用 |
| `app_icon_alt.png` | `assets/resources/branding` | `docs/branding_assets` | 上架素材，运行时未引用 |
| `share_cover.png` | `assets/resources/branding` | `docs/branding_assets` | 上架素材，运行时未引用 |

仍在运行包内：

| 文件 | 引用位置 |
| --- | --- |
| `assets/resources/meteor/bg_game_meteor.jpg` | `GameManager.ts` 动态加载 `meteor/bg_game_meteor/spriteFrame` |
| `assets/resources/meteor/bg_loading_meteor.jpg` | `UIManager.ts` 动态加载 `meteor/bg_loading_meteor/spriteFrame` |

## 已执行优化

| 资源 | 优化前 | 优化后 | 说明 |
| --- | ---: | ---: | --- |
| `bg_game_meteor.png` -> `bg_game_meteor.jpg` | 1083.3 KB | 119.8 KB | 转 JPG，尺寸调整为 720x1280 |
| `bg_loading_meteor.png` -> `bg_loading_meteor.jpg` | 347.7 KB | 36.9 KB | 转 JPG，尺寸调整为 720x484 |
| `assets/resources/branding/*` | 1004.3 KB | 0 KB in runtime resources | 移到 `docs/branding_assets` |
| `assets/resources` 总量 | 约 2444.3 KB | 162.6 KB | 仅保留运行时必需资源 |

原 PNG 已备份到 `docs/optimization_originals`。

## 引擎模块裁剪

保留模块：

`base`, `gfx-webgl`, `2d`, `affine-transform`, `graphics`, `ui`, `tween`, `custom-pipeline`

关闭模块：

`gfx-webgl2`, `animation`, `rich-text`, `mask`, `physics-2d`, `intersection-2d`, `profiler`, `particle-2d`, `audio`, `video`, `webview`, `tiled-map`, `spine`, `dragon-bones`

## 分包方案

当前项目资源已足够小，重新构建后理论上不需要分包即可低于 4MB。

如果后续继续加资源，建议这样拆：

| Bundle | 路径建议 | 内容 | 微信压缩类型 |
| --- | --- | --- | --- |
| `main` | 首场景和核心脚本 | 开始界面、基础玩法、必要 UI | `merge_dep` |
| `game-res` | `assets/bundles/game-res` | 大背景、关卡大图、皮肤资源 | 小游戏分包 |
| `audio` | `assets/bundles/audio` | BGM、音效 | 小游戏分包或远程 |

加载方式建议：

```ts
assetManager.loadBundle('game-res', (err, bundle) => {
  if (err || !bundle) {
    return;
  }
  bundle.load('meteor/bg_game_meteor/spriteFrame', SpriteFrame, (loadErr, spriteFrame) => {
    // 使用分包资源
  });
});
```

## 构建注意

旧的 `build/wechatgame` 是上一次构建产物，仍可能显示 5MB 以上。需要在 Cocos Creator 里重新构建微信小游戏包后再看真实体积。
