export interface LevelData {
  knives: number;
  speed: number;
  dir: 1 | -1;
  initialKnifeAngles?: number[];
  reverseInterval?: number;
  minSpeed?: number;
  maxSpeed?: number;
  wavePeriod?: number;
  randomReverse?: boolean;
}

export const GAMEPLAY_TUNING = {
  collision: {
    warningAngleOffset: 6,
  },
  feedback: {
    hitStopSuccess: 0.08,
    hitStopFail: 0.12,
    failPanelDelay: 0.25,
    screenShakeDuration: 0.18,
    screenShakeStrength: 8,
  },
  combo: {
    combo3: 3,
    combo5: 5,
    combo8: 8,
    slowMotionScale: 0.75,
    slowMotionDuration: 0.18,
  },
  reverse: {
    minInterval: 3,
    maxInterval: 6,
    warningDuration: 0.5,
  },
  speedWave: {
    enabled: true,
    useSinWave: true,
  },
};

const LEVELS: LevelData[] = [
  { knives: 5, speed: 120, minSpeed: 110, maxSpeed: 130, wavePeriod: 4.5, dir: 1 },
  { knives: 7, speed: 135, minSpeed: 120, maxSpeed: 150, wavePeriod: 4.2, dir: 1 },
  { knives: 7, speed: 155, minSpeed: 130, maxSpeed: 180, wavePeriod: 3.8, dir: 1 },
  { knives: 7, speed: 165, minSpeed: 140, maxSpeed: 190, wavePeriod: 3.6, dir: 1, initialKnifeAngles: [35, 215] },
  { knives: 7, speed: 175, minSpeed: 145, maxSpeed: 205, wavePeriod: 3.3, dir: 1, initialKnifeAngles: [35, 125, 215, 305] },
  {
    knives: 7,
    speed: 182.5,
    minSpeed: 150,
    maxSpeed: 215,
    wavePeriod: 3,
    dir: 1,
    initialKnifeAngles: [35, 125, 215, 305],
    randomReverse: true,
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
