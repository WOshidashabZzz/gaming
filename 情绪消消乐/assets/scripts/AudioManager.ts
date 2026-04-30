import { _decorator, AudioClip, AudioSource, Component, resources } from 'cc';
import { AudioKey } from './AudioKeys';

const { ccclass } = _decorator;

const MUSIC_KEY = 'emotion_match_music_enabled';
const SFX_KEY = 'emotion_match_sfx_enabled';

const AUDIO_PATHS: Partial<Record<AudioKey, string>> = {
  [AudioKey.Button]: 'audio/ui_click_soft',
  [AudioKey.Tap]: 'audio/ui_click_soft',
  [AudioKey.Swap]: 'audio/block_swap_magic',
  [AudioKey.Clear]: 'audio/match_clear_sparkle',
  [AudioKey.Combo]: 'audio/match_clear_sparkle',
  [AudioKey.Special]: 'audio/sunshine_burst',
  [AudioKey.Release]: 'audio/sunshine_burst',
  [AudioKey.Win]: 'audio/level_complete_jingle',
  [AudioKey.Fail]: 'audio/level_fail_soft',
};

@ccclass('AudioManager')
export class AudioManager extends Component {
  private musicSource!: AudioSource;
  private sfxSource!: AudioSource;
  private clips = new Map<AudioKey, AudioClip>();
  private bgmClip: AudioClip | null = null;
  private musicEnabled = true;
  private sfxEnabled = true;

  init() {
    this.musicSource = this.node.addComponent(AudioSource);
    this.sfxSource = this.node.addComponent(AudioSource);
    this.musicSource.loop = true;
    this.musicSource.volume = 0.45;
    this.sfxSource.volume = 0.8;
    this.musicEnabled = this.readToggle(MUSIC_KEY, true);
    this.sfxEnabled = this.readToggle(SFX_KEY, true);
    this.loadClips();
  }

  playBgm() {
    if (!this.musicEnabled || !this.bgmClip) return;
    this.musicSource.clip = this.bgmClip;
    this.musicSource.loop = true;
    if (!this.musicSource.playing) this.musicSource.play();
  }

  stopBgm() {
    if (this.musicSource?.playing) this.musicSource.stop();
  }

  play(key: AudioKey) {
    if (!this.sfxEnabled) return;
    const clip = this.clips.get(key);
    if (!clip) return;
    this.sfxSource.playOneShot(clip, 1);
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    localStorage.setItem(MUSIC_KEY, enabled ? '1' : '0');
    if (enabled) this.playBgm();
    else this.stopBgm();
  }

  setSfxEnabled(enabled: boolean) {
    this.sfxEnabled = enabled;
    localStorage.setItem(SFX_KEY, enabled ? '1' : '0');
  }

  toggleMusic(): boolean {
    this.setMusicEnabled(!this.musicEnabled);
    return this.musicEnabled;
  }

  toggleSfx(): boolean {
    this.setSfxEnabled(!this.sfxEnabled);
    return this.sfxEnabled;
  }

  isMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  isSfxEnabled(): boolean {
    return this.sfxEnabled;
  }

  private loadClips() {
    resources.load('audio/bgm_moon_emotion_loop_30s', AudioClip, (error, clip) => {
      if (!error && clip) {
        this.bgmClip = clip;
        this.playBgm();
      }
    });

    Object.entries(AUDIO_PATHS).forEach(([key, path]) => {
      resources.load(path, AudioClip, (error, clip) => {
        if (!error && clip) this.clips.set(key as AudioKey, clip);
      });
    });
  }

  private readToggle(key: string, fallback: boolean): boolean {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw !== '0';
  }
}
