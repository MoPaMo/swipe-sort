export type Photo = {
  /** `ph://…` on iOS, `content://…` on Android — both load directly in expo-image. */
  id: string;
  /** Milliseconds since epoch, or null if the library doesn't know. */
  creationTime: number | null;
  width: number | null;
  height: number | null;
};

export type Decision = 'keep' | 'delete';

export type SortOrder = 'newest' | 'oldest';
