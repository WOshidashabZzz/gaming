import { BLOCK_LABELS, GoalConfig, GoalProgressEvent, GoalType, NEGATIVE_BLOCKS, SpecialType } from './GameTypes';

export class GoalManager {
  private goals: GoalConfig[] = [];
  private progress: number[] = [];

  reset(goals: GoalConfig[]) {
    this.goals = goals;
    this.progress = goals.map(() => 0);
  }

  apply(event: GoalProgressEvent) {
    this.goals.forEach((goal, index) => {
      let add = 0;
      if (goal.type === GoalType.ClearBlock && goal.block) add = event.clearedBlocks[goal.block] ?? 0;
      if (goal.type === GoalType.CollectPositive && goal.block) add = event.collectedPositive[goal.block] ?? 0;
      if (goal.type === GoalType.ClearNegative) add = NEGATIVE_BLOCKS.reduce((sum, type) => sum + (event.clearedBlocks[type] ?? 0), 0);
      if (goal.type === GoalType.ClearFog) add = event.clearedFog;
      if (goal.type === GoalType.UnlockChain) add = event.unlockedChains;
      if (goal.type === GoalType.ClearCloud) add = event.clearedClouds;
      if (goal.type === GoalType.UseSpecial) {
        if (goal.special === SpecialType.Row) add = (event.usedSpecial[SpecialType.Row] ?? 0) + (event.usedSpecial[SpecialType.Column] ?? 0);
        else if (goal.special) add = event.usedSpecial[goal.special] ?? 0;
      }
      if (goal.type === GoalType.Combo && event.combo >= goal.count) add = goal.count;
      if (goal.type === GoalType.EmotionRelease) add = event.emotionRelease;
      this.progress[index] = Math.min(goal.count, this.progress[index] + add);
    });
  }

  isComplete(): boolean {
    return this.goals.every((goal, i) => this.progress[i] >= goal.count);
  }

  describe(): string[] {
    return this.goals.map((goal, i) => `${this.label(goal)} ${this.progress[i]}/${goal.count}`);
  }

  private label(goal: GoalConfig): string {
    if (goal.type === GoalType.ClearBlock && goal.block) return `清理${BLOCK_LABELS[goal.block]}`;
    if (goal.type === GoalType.CollectPositive && goal.block) return `收集${BLOCK_LABELS[goal.block]}`;
    if (goal.type === GoalType.ClearNegative) return '清理坏情绪';
    if (goal.type === GoalType.ClearFog) return '清除黑雾';
    if (goal.type === GoalType.UnlockChain) return '解开锁链';
    if (goal.type === GoalType.ClearCloud) return '清除倒霉云';
    if (goal.type === GoalType.UseSpecial) return '使用道具';
    if (goal.type === GoalType.Combo) return '完成连击';
    return '情绪释放';
  }
}
