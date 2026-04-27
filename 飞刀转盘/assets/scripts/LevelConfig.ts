export interface SpeedPulseData {
  min: number;
  max: number;
  period: number;
}

export interface LevelData {
  knives: number;
  speed: number;
  dir: 1 | -1;
  initialKnifeAngles?: number[];
  reverseInterval?: number;
  reverseIntervalRange?: [number, number];
  reverseWarnDuration?: number;
  speedPulse?: SpeedPulseData;
}

const LEVELS: LevelData[] = [
  { knives: 5, speed: 120, dir: 1 },
  { knives: 7, speed: 120, dir: 1 },
  { knives: 7, speed: 160, dir: 1, speedPulse: { min: 140, max: 180, period: 5.5 } },
  { knives: 7, speed: 170, dir: 1, initialKnifeAngles: [35, 215] },
  {
    knives: 7,
    speed: 170,
    dir: 1,
    initialKnifeAngles: [35, 125, 215, 305],
    speedPulse: { min: 140, max: 180, period: 6.5 },
  },
  {
    knives: 7,
    speed: 170,
    dir: 1,
    initialKnifeAngles: [35, 125, 215, 305],
    reverseIntervalRange: [3, 6],
    reverseWarnDuration: 0.5,
    speedPulse: { min: 140, max: 180, period: 5 },
  },
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
