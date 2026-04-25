export interface LevelData {
  knives: number;
  speed: number;
  dir: 1 | -1;
  initialKnifeAngles?: number[];
  reverseInterval?: number;
}

const LEVELS: LevelData[] = [
  // 第一关：保持不变
  { knives: 5, speed: 120, dir: 1 },
  // 第二关：增加刀数
  { knives: 7, speed: 120, dir: 1 },
  // 第三关：增加转盘转速
  { knives: 7, speed: 170, dir: 1 },
  // 第四关：开局多两把飞刀（障碍刀）
  { knives: 7, speed: 170, dir: 1, initialKnifeAngles: [35, 215] },
  // 第五关：在第四关基础上再加两把障碍刀（共四把）
  { knives: 7, speed: 170, dir: 1, initialKnifeAngles: [35, 125, 215, 305] },
  // 第六关：在第五关基础上增加定时反转（每5秒）
  { knives: 7, speed: 170, dir: 1, initialKnifeAngles: [35, 125, 215, 305], reverseInterval: 5 },
];

export class LevelConfig {
  public static getLevel(levelIndex: number): LevelData | null {
    if (!this.hasLevel(levelIndex)) {
      return null;
    }
    return LEVELS[levelIndex];
  }

  public static hasLevel(levelIndex: number): boolean {
    return levelIndex >= 0 && levelIndex < LEVELS.length;
  }

  public static totalLevels(): number {
    return LEVELS.length;
  }
}
