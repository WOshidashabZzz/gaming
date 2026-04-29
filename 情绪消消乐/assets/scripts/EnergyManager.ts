import { ENCOURAGE_LINES } from './GameTypes';

export class EnergyManager {
  value = 0;
  required = 100;

  reset(required: number) {
    this.value = 0;
    this.required = required;
  }

  restore(required: number, value: number) {
    this.required = required;
    this.value = Math.max(0, Math.min(required, value));
  }

  add(clearedNegative: number, combo: number): boolean {
    const comboBonus = combo >= 3 ? 10 : combo >= 2 ? 5 : 0;
    this.value += clearedNegative * 5 + comboBonus;
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
