import type { Ionicons } from '@expo/vector-icons';
import { Album, AssetField, MediaSubtype, type Query } from 'expo-media-library';
import { Platform } from 'react-native';

export type CategoryId = 'all' | 'screenshots' | 'live' | 'portraits' | 'panoramas' | 'favorites';

export type Category = {
  id: CategoryId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /**
   * Narrow a query to this category. Returns null when the category can't be resolved on this
   * device (e.g. no "Screenshots" album on Android).
   */
  apply: (q: Query) => Promise<Query | null>;
};

const ios = Platform.OS === 'ios';

const ALL: Category[] = [
  { id: 'all', label: 'All', icon: 'images-outline', apply: async (q) => q },
  {
    id: 'screenshots',
    label: 'Screenshots',
    icon: 'phone-portrait-outline',
    apply: async (q) => {
      if (ios) return q.contains(AssetField.MEDIA_SUBTYPES, MediaSubtype.SCREENSHOT);
      // Android has no subtype flag; screenshots live in an album (folder) called "Screenshots".
      try {
        const album = await Album.get('Screenshots');
        return album ? q.album(album) : null;
      } catch {
        return null;
      }
    },
  },
  {
    id: 'live',
    label: 'Live Photos',
    icon: 'radio-button-on-outline',
    apply: async (q) => q.contains(AssetField.MEDIA_SUBTYPES, MediaSubtype.LIVE_PHOTO),
  },
  {
    id: 'portraits',
    label: 'Portraits',
    icon: 'person-outline',
    apply: async (q) => q.contains(AssetField.MEDIA_SUBTYPES, MediaSubtype.DEPTH_EFFECT),
  },
  {
    id: 'panoramas',
    label: 'Panoramas',
    icon: 'resize-outline',
    apply: async (q) => q.contains(AssetField.MEDIA_SUBTYPES, MediaSubtype.PANORAMA),
  },
  {
    id: 'favorites',
    label: 'Favorites',
    icon: 'heart-outline',
    apply: async (q) => q.eq(AssetField.IS_FAVORITE, true),
  },
];

/** Live Photos, Portraits and Panoramas are iOS-only subtypes. */
const IOS_ONLY: CategoryId[] = ['live', 'portraits', 'panoramas'];

export const CATEGORIES: Category[] = ALL.filter((c) => ios || !IOS_ONLY.includes(c.id));

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
}
