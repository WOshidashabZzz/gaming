# 情绪消消乐实现报告

## 新建脚本

- `assets/scripts/GameManager.ts`：游戏流程、关卡切换、胜负判断。
- `assets/scripts/BoardManager.ts`：8x8 棋盘、交换、三消、连锁、下落、补充、特殊道具触发。
- `assets/scripts/Block.ts`：单个方块显示、图标加载、选中与消除反馈。
- `assets/scripts/MatchChecker.ts`：横纵三消、4 连、5 连、L/T 型检测。
- `assets/scripts/LevelManager.ts`：关卡加载。
- `assets/scripts/LevelConfig.ts`：前 10 关配置。
- `assets/scripts/GoalManager.ts`：目标进度统计。
- `assets/scripts/EnergyManager.ts`：情绪能量瓶。
- `assets/scripts/ObstacleManager.ts`：黑雾、压力锁链、倒霉云。
- `assets/scripts/UIManager.ts`：主界面、游戏界面、结算弹窗。
- `assets/scripts/FeedbackManager.ts`：浮字、音效接口预留。
- `assets/scripts/GameTypes.ts` / `AudioKeys.ts`：类型与常量。

## Prefab

当前没有新建 prefab。棋盘、方块、HUD、弹窗均由脚本运行时生成，方便先验证玩法闭环；后续可把 `Block`、按钮、弹窗沉淀成 prefab。

## 配置与素材

- 关卡配置：`assets/scripts/LevelConfig.ts`
- 原始素材：`ChatGPT Image 2026年4月28日 20_04_45.png`
- 裁切资源：
  - `assets/resources/bg`
  - `assets/resources/blocks`
  - `assets/resources/items`
  - `assets/resources/ui`
  - `assets/resources/fx`

## 已实现玩法

- 8x8 竖屏棋盘。
- 点击相邻方块交换。
- 三消检测、消除、下落、补充、连续连锁。
- 步数限制、胜负弹窗。
- 清指定情绪、收集正面情绪、清黑雾、解锁链、清倒霉云、连击、能量释放等目标。
- 横向清除、纵向清除、情绪炸弹、彩虹球、好运星星的基础逻辑。
- 情绪能量瓶，满后随机清理负面情绪并显示鼓励文案。
- 黑雾、压力锁链、倒霉云轻量障碍。
- 音效调用接口预留。

## 待加强

- 特效目前以浮字、缩放和图标反馈为主，粒子光波可继续精修。
- 道具栏按钮只是展示入口，未做玩家主动道具库存消耗。
- 当前场景使用脚本生成 UI，正式美术版建议 prefab 化。
- 尚未在 Cocos Creator 编辑器内真机预览验证。

## 可调参数

- `LevelConfig.ts`：步数、棋盘尺寸、可出现方块、目标、障碍位置、能量需求、倒霉云扩散间隔。
- `EnergyManager.ts`：能量增长倍率与鼓励文案。
- `BoardManager.ts`：好运星星生成概率、情绪释放清理数量、棋盘尺寸计算。

## 风险

- 方块节点已有简单对象池，但频繁重绘整盘仍可继续优化为只移动变化节点。
- 素材来自单张方案图裁切，部分 UI/特效边缘可能需要二次精裁。
- 移动端 720x1280 适配已按竖屏设计，1080x1920 需要在 Creator 预览中确认刘海屏和安全区。

## 优先测试

1. 第 1 关基础交换、非法交换回退、目标完成。
2. 第 4 关 4 连生成并触发横/纵清除。
3. 第 5-8 关三类障碍目标计数。
4. 第 7 关能量瓶满后的情绪释放。
5. 第 10 关通关文案“小幸运回来了”。
