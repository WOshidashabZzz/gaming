import { LevelConfig } from './GameTypes';
import { LEVELS } from './LevelConfig';

export class LevelManager {
  private currentIndex = 0;

  get currentLevel(): LevelConfig {
    return LEVELS[this.currentIndex];
  }

  load(level: number): LevelConfig {
    this.currentIndex = Math.max(0, Math.min(LEVELS.length - 1, level - 1));
    return this.currentLevel;
  }

  next(): LevelConfig {
    this.currentIndex = Math.min(LEVELS.length - 1, this.currentIndex + 1);
    return this.currentLevel;
  }

  get currentNumber(): number {
    return this.currentIndex + 1;
  }

  get maxNumber(): number {
    return LEVELS.length;
  }
}
