import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Photo } from './types';

const KEPT_KEY = 'swipesort:kept:v1';
const TRASH_KEY = 'swipesort:trash:v1';
const ORDER_KEY = 'swipesort:order:v1';

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});
}

export const storage = {
  loadKept: () => readJson<string[]>(KEPT_KEY, []),
  saveKept: (ids: Set<string>) => writeJson(KEPT_KEY, [...ids]),

  loadTrash: () => readJson<Photo[]>(TRASH_KEY, []),
  saveTrash: (photos: Photo[]) => writeJson(TRASH_KEY, photos),

  loadOrder: () => readJson<'newest' | 'oldest'>(ORDER_KEY, 'newest'),
  saveOrder: (order: 'newest' | 'oldest') => writeJson(ORDER_KEY, order),
};
