import { Node } from 'cc';

export enum BlockType {
  Annoyed = 'annoyed',
  Anxiety = 'anxiety',
  Pressure = 'pressure',
  Sad = 'sad',
  Badluck = 'badluck',
  Happy = 'happy',
  Relax = 'relax',
  Calm = 'calm',
  Hope = 'hope',
  Grateful = 'grateful',
  Lucky = 'lucky',
}

export enum SpecialType {
  None = 'none',
  Row = 'row',
  Column = 'column',
  Bomb = 'bomb',
  Rainbow = 'rainbow',
  LuckyStar = 'luckyStar',
}

export enum GoalType {
  ClearEmotion = 'clearEmotion',
  ClearAnyNegative = 'clearAnyNegative',
  Combo = 'combo',
  ClearFog = 'clearFog',
  EmotionRelease = 'emotionRelease',
}

export interface BoardPos {
  row: number;
  col: number;
}

export interface GoalConfig {
  type: GoalType;
  emotion?: BlockType;
  comboLevel?: number;
  target: number;
}

export interface ObstacleCounts {
  fog: number;
  chain: number;
  cloud: number;
}

export interface ToolCounts {
  star: number;
  hammer: number;
}

export interface LevelConfig {
  level: number;
  name: string;
  steps: number;
  boardWidth: number;
  boardHeight: number;
  availableBlocks: BlockType[];
  initialTools: ToolCounts;
  goals: GoalConfig[];
  obstacles: ObstacleCounts;
  energyRequired: number;
  tutorial: string;
}

export interface CellState {
  row: number;
  col: number;
  type: BlockType;
  special: SpecialType;
  fog: boolean;
  chained: boolean;
  cloud: boolean;
  node: Node;
}

export interface MatchGroup {
  cells: CellState[];
  type: BlockType;
  horizontal: boolean;
  vertical: boolean;
  isLine4: boolean;
  isLine5: boolean;
  isCross: boolean;
}

export interface GoalProgressEvent {
  clearedBlocks: Partial<Record<BlockType, number>>;
  collectedPositive: Partial<Record<BlockType, number>>;
  clearedFog: number;
  unlockedChains: number;
  clearedClouds: number;
  usedSpecial: Partial<Record<SpecialType, number>>;
  combo: number;
  emotionRelease: number;
}

export const NEGATIVE_BLOCKS = [
  BlockType.Annoyed,
  BlockType.Anxiety,
  BlockType.Pressure,
  BlockType.Sad,
  BlockType.Badluck,
];

export const POSITIVE_BLOCKS = [
  BlockType.Happy,
  BlockType.Relax,
  BlockType.Calm,
  BlockType.Hope,
  BlockType.Grateful,
  BlockType.Lucky,
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  [BlockType.Annoyed]: '烦躁',
  [BlockType.Anxiety]: '焦虑',
  [BlockType.Pressure]: '压力',
  [BlockType.Sad]: '忧郁',
  [BlockType.Badluck]: '倒霉',
  [BlockType.Happy]: '开心',
  [BlockType.Relax]: '放松',
  [BlockType.Calm]: '平静',
  [BlockType.Hope]: '希望',
  [BlockType.Grateful]: '感恩',
  [BlockType.Lucky]: '好运',
};

export const BLOCK_COLORS: Record<BlockType, string> = {
  [BlockType.Annoyed]: '#ff6b4a',
  [BlockType.Anxiety]: '#9b5de5',
  [BlockType.Pressure]: '#3a86ff',
  [BlockType.Sad]: '#70c1ff',
  [BlockType.Badluck]: '#5e548e',
  [BlockType.Happy]: '#ffd866',
  [BlockType.Relax]: '#91dc75',
  [BlockType.Calm]: '#b68bea',
  [BlockType.Hope]: '#ffbf59',
  [BlockType.Grateful]: '#e983c6',
  [BlockType.Lucky]: '#9bd979',
};

export const ENCOURAGE_LINES = [
  '好多了。',
  '压力被释放了一点。',
  '今天也辛苦了。',
  '坏情绪正在离开。',
  '小幸运正在靠近。',
];
