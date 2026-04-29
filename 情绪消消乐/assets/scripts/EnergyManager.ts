import { ENCOURAGE_LINES } from './GameTypes';

export class EnergyManager {
  value = 0;
  required = 100;

  reset(required: number) {
    this.value = 0;
    this.required = required;
  }

  add(clearedNegative: number, combo: number): boolean {
    this.value += clearedNegative * (5 + Math.max(0, combo - 1) * 2);
    if (this.value < this.required) return false;
    this.value = 0;
    return true;
  }

  get percent(): number {
    return Math.min(1, this.value / Math.max(1, this.required));
  }

  randomLine(): string {
    return ENCOURAGE_LINES[Math.floor(Math.random() * ENCOURAGE_LINES.length)];
  }
}
