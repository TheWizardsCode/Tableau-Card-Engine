import type { SoundPlayer } from './SoundManager';

export interface TfVoice {
  play?: () => void;
  stop?: () => void;
  setVolume?: (volume: number) => void;
  setMute?: (muted: boolean) => void;
}

export type TfFactory = () => TfVoice;

export interface TfGeneratedModule {
  factories?: Record<string, TfFactory>;
  getFactory?: (name: string) => TfFactory | undefined;
  descriptors?: Record<string, { factory?: string }>;
}

export interface TfAdapterLogger {
  warn: (message: string) => void;
}

export interface CreateTfPlayerOptions {
  keyMap?: Record<string, string>;
  logger?: TfAdapterLogger;
}

export interface TfPlayer extends SoundPlayer {
  toggleMute(): boolean;
}

export function createTfPlayer(
  tfModule: TfGeneratedModule,
  options?: CreateTfPlayerOptions,
): TfPlayer {
  const keyMap = options?.keyMap ?? {};
  const logger: TfAdapterLogger = options?.logger ?? { warn: (message: string) => console.warn(message) };

  const activeVoices = new Map<string, TfVoice>();
  let volume = 0.5;
  let muted = false;

  const resolveFactory = (logicalKey: string): TfFactory | undefined => {
    const mappedKey = keyMap[logicalKey] ?? logicalKey;

    const fromGetter = tfModule.getFactory?.(mappedKey);
    if (fromGetter) return fromGetter;

    const directFactory = tfModule.factories?.[mappedKey];
    if (directFactory) return directFactory;

    const descriptorFactoryName = tfModule.descriptors?.[mappedKey]?.factory;
    if (descriptorFactoryName) {
      const descriptorFactory = tfModule.factories?.[descriptorFactoryName];
      if (descriptorFactory) return descriptorFactory;
    }

    logger.warn(
      `[tfAdapter] Missing tf factory for key "${logicalKey}" (mapped: "${mappedKey}")`,
    );

    return undefined;
  };

  return {
    play: (logicalKey: string) => {
      const factory = resolveFactory(logicalKey);
      if (!factory) return;

      try {
        const voice = factory();
        voice.setVolume?.(volume);
        voice.setMute?.(muted);
        voice.play?.();
        activeVoices.set(logicalKey, voice);
      } catch {
        logger.warn(`[tfAdapter] Failed to create tf voice for key "${logicalKey}"`);
      }
    },

    stop: (logicalKey: string) => {
      const voice = activeVoices.get(logicalKey);
      if (!voice) return;
      try {
        voice.stop?.();
      } finally {
        activeVoices.delete(logicalKey);
      }
    },

    setVolume: (nextVolume: number) => {
      volume = Math.max(0, Math.min(1, nextVolume));
      for (const voice of activeVoices.values()) {
        voice.setVolume?.(volume);
      }
    },

    setMute: (nextMuted: boolean) => {
      muted = nextMuted;
      for (const voice of activeVoices.values()) {
        voice.setMute?.(muted);
      }
    },

    toggleMute: () => {
      muted = !muted;
      for (const voice of activeVoices.values()) {
        voice.setMute?.(muted);
      }
      return muted;
    },
  };
}
