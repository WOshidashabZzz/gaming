import { BLOCK_LABELS, GoalConfig, GoalProgressEvent, GoalType, NEGATIVE_BLOCKS } from './GameTypes';

export class GoalManager {
  private goals: GoalConfig[] = [];
  private progress: number[] = [];

  reset(goals: GoalConfig[]) {
    this.goals = goals;
    this.progress = goals.map(() => 0);
  }

  restore(goals: GoalConfig[], progress: number[]) {
    this.goals = goals;
    this.progress = goals.map((goal, index) => Math.min(goal.target, Math.max(0, progress[index] ?? 0)));
  }

  snapshot(): number[] {
    return [...this.progress];
  }

  apply(event: GoalProgressEvent) {
    this.goals.forEach((goal, index) => {
      let add = 0;
      if (goal.type === GoalType.ClearEmotion && goal.emotion) add = event.clearedBlocks[goal.emotion] ?? 0;
      if (goal.type === GoalType.ClearAnyNegative) add = NEGATIVE_BLOCKS.reduce((sum, type) => sum + (event.clearedBlocks[type] ?? 0), 0);
      if (goal.type === GoalType.ClearFog) add = event.clearedFog;
      if (goal.type === GoalType.Combo && event.combo >= (goal.comboLevel ?? 2)) add = 1;
      if (goal.type === GoalType.EmotionRelease) add = event.emotionRelease;
      this.progress[index] = Math.min(goal.target, this.progress[index] + add);
    });
  }

  isComplete(): boolean {
    return this.goals.every((goal, i) => this.progress[i] >= goal.target);
  }

  describe(): string[] {
    return this.goals.map((goal, i) => `${this.label(goal)} ${this.progress[i]}/${goal.target}`);
  }

  private label(goal: GoalConfig): string {
    if (goal.type === GoalType.ClearEmotion && goal.emotion) return `清理${BLOCK_LABELS[goal.emotion]}`;
    if (goal.type === GoalType.ClearAnyNegative) return '清理坏情绪';
    if (goal.type === GoalType.Combo) return `触发 ${goal.comboLevel ?? 2} 连击`;
    if (goal.type === GoalType.ClearFog) return '清除黑雾';
    return '触发情绪释放';
  }
}
