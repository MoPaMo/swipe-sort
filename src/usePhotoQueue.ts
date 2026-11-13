import { Asset, AssetField, MediaType, Query } from 'expo-media-library';
import { useCallback, useEffect, useRef, useState } from 'react';

import { storage } from './storage';
import type { Decision, Photo, SortOrder } from './types';

/** How many unreviewed photos we try to keep buffered ahead of the user. */
const BUFFER_TARGET = 30;
/** Refill when the queue drops below this. */
const REFILL_AT = 8;
/** Raw page size per library query (metadata only, so this is cheap). */
const PAGE_SIZE = 200;

type HistoryEntry = { photo: Photo; decision: Decision };

/**
 * Owns everything about the review session:
 *  - paging photos out of the library (cursor-based on creation time, so deletions don't shift pages)
 *  - skipping photos already kept in earlier sessions
 *  - the pending-delete "trash" (persisted, nothing is deleted until commitDelete())
 *  - undo history
 */
export function usePhotoQueue(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const [order, setOrderState] = useState<SortOrder>('newest');
  const [queue, setQueue] = useState<Photo[]>([]);
  const [trash, setTrash] = useState<Photo[]>([]);
  const [keptCount, setKeptCount] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [sessionStats, setSessionStats] = useState({ kept: 0, deleted: 0 });

  // Mutable bookkeeping that shouldn't trigger renders.
  const kept = useRef(new Set<string>());
  const trashIds = useRef(new Set<string>());
  const seen = useRef(new Set<string>()); // everything fetched since the last reset
  const cursor = useRef<number | null>(null); // creationTime of the last fetched photo
  const strictCursor = useRef(false); // use lt/gt instead of lte/gte (tie-breaker escape hatch)
  const exhaustedRef = useRef(false);
  const loadingRef = useRef(false);
  const generation = useRef(0); // bumps on reset so stale loads are dropped
  const history = useRef<HistoryEntry[]>([]);
  const setHistory = useCallback((next: HistoryEntry[]) => {
    history.current = next;
    setCanUndo(next.length > 0);
  }, []);

  // ---- hydrate persisted state ------------------------------------------------
  useEffect(() => {
    (async () => {
      const [k, t, o] = await Promise.all([
        storage.loadKept(),
        storage.loadTrash(),
        storage.loadOrder(),
      ]);
      kept.current = new Set(k);
      trashIds.current = new Set(t.map((p) => p.id));
      setKeptCount(k.length);
      setTrash(t);
      setOrderState(o);
      setReady(true);
    })();
  }, []);

  // ---- paging -----------------------------------------------------------------
  const fetchPage = useCallback(
    async (sortOrder: SortOrder) => {
      const newestFirst = sortOrder === 'newest';
      let q = new Query()
        .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
        .orderBy({ key: AssetField.CREATION_TIME, ascending: !newestFirst })
        .limit(PAGE_SIZE);

      if (cursor.current !== null) {
        const c = cursor.current;
        if (newestFirst) q = strictCursor.current ? q.lt(AssetField.CREATION_TIME, c) : q.lte(AssetField.CREATION_TIME, c);
        else q = strictCursor.current ? q.gt(AssetField.CREATION_TIME, c) : q.gte(AssetField.CREATION_TIME, c);
      }

      const rows = await q.exeForMetadata();
      return rows;
    },
    [],
  );

  const loadMore = useCallback(
    async (sortOrder: SortOrder) => {
      if (loadingRef.current || exhaustedRef.current) return;
      loadingRef.current = true;
      const gen = generation.current;

      try {
        const fresh: Photo[] = [];
        // Keep pulling pages until we have enough unreviewed photos or run out.
        while (fresh.length < BUFFER_TARGET && !exhaustedRef.current) {
          const rows = await fetchPage(sortOrder);
          if (gen !== generation.current) return; // a reset happened mid-flight

          let newRows = 0;
          for (const r of rows) {
            if (seen.current.has(r.id)) continue;
            seen.current.add(r.id);
            newRows++;
            if (r.creationTime !== null) cursor.current = r.creationTime;
            if (kept.current.has(r.id) || trashIds.current.has(r.id)) continue;
            fresh.push({
              id: r.id,
              creationTime: r.creationTime,
              width: r.width,
              height: r.height,
            });
          }

          if (rows.length < PAGE_SIZE) {
            exhaustedRef.current = true;
          } else if (newRows === 0) {
            // A whole page of identical timestamps we've already seen: step strictly past it.
            if (strictCursor.current) exhaustedRef.current = true;
            strictCursor.current = true;
          } else {
            strictCursor.current = false;
          }
        }

        if (gen !== generation.current) return;
        setQueue((q) => [...q, ...fresh]);
        setExhausted(exhaustedRef.current);
      } catch (e) {
        console.warn('Failed to load photos', e);
      } finally {
        if (gen === generation.current) loadingRef.current = false;
      }
    },
    [fetchPage],
  );

  const reset = useCallback(
    (sortOrder: SortOrder) => {
      generation.current++;
      seen.current = new Set();
      cursor.current = null;
      strictCursor.current = false;
      exhaustedRef.current = false;
      loadingRef.current = false;
      setExhausted(false);
      setQueue([]);
      setHistory([]);
      loadMore(sortOrder);
    },
    [loadMore, setHistory],
  );

  // Initial load + refill when running low.
  useEffect(() => {
    // loadMore only sets state after awaiting the library query, so this doesn't render synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ready && enabled && queue.length < REFILL_AT) loadMore(order);
  }, [queue.length, ready, enabled, order, loadMore]);

  // ---- decisions ----------------------------------------------------------------
  const decide = useCallback((photo: Photo, decision: Decision) => {
    setQueue((q) => q.filter((p) => p.id !== photo.id));
    setHistory([...history.current.slice(-49), { photo, decision }]);
    setSessionStats((s) =>
      decision === 'keep' ? { ...s, kept: s.kept + 1 } : { ...s, deleted: s.deleted + 1 },
    );

    if (decision === 'keep') {
      kept.current.add(photo.id);
      storage.saveKept(kept.current);
      setKeptCount(kept.current.size);
    } else {
      trashIds.current.add(photo.id);
      setTrash((t) => {
        const next = [...t, photo];
        storage.saveTrash(next);
        return next;
      });
    }
  }, [setHistory]);

  const undo = useCallback(() => {
    const last = history.current[history.current.length - 1];
    if (!last) return;
    const { photo, decision } = last;
    setHistory(history.current.slice(0, -1));

    if (decision === 'keep') {
      kept.current.delete(photo.id);
      storage.saveKept(kept.current);
      setKeptCount(kept.current.size);
    } else {
      trashIds.current.delete(photo.id);
      setTrash((t) => {
        const next = t.filter((p) => p.id !== photo.id);
        storage.saveTrash(next);
        return next;
      });
    }
    setSessionStats((s) =>
      decision === 'keep' ? { ...s, kept: s.kept - 1 } : { ...s, deleted: s.deleted - 1 },
    );
    setQueue((q) => [photo, ...q]);
  }, [setHistory]);

  /** Pull a photo back out of the trash (counts as "keep"). */
  const restore = useCallback((photo: Photo) => {
    trashIds.current.delete(photo.id);
    kept.current.add(photo.id);
    storage.saveKept(kept.current);
    setKeptCount(kept.current.size);
    setTrash((t) => {
      const next = t.filter((p) => p.id !== photo.id);
      storage.saveTrash(next);
      return next;
    });
    setHistory(history.current.filter((e) => e.photo.id !== photo.id));
  }, [setHistory]);

  /**
   * Actually delete everything in the trash, in ONE system call — so iOS/Android show a single
   * confirmation prompt instead of one per photo. Returns false if the user cancelled.
   */
  const commitDelete = useCallback(async (): Promise<boolean> => {
    const toDelete = trash;
    if (toDelete.length === 0) return true;
    try {
      await Asset.delete(toDelete.map((p) => new Asset(p.id)));
    } catch (e) {
      console.warn('Delete cancelled or failed', e);
      return false;
    }
    const deleted = new Set(toDelete.map((p) => p.id));
    for (const id of deleted) trashIds.current.delete(id);
    setTrash((t) => {
      const next = t.filter((p) => !deleted.has(p.id));
      storage.saveTrash(next);
      return next;
    });
    setHistory(history.current.filter((e) => !deleted.has(e.photo.id)));
    return true;
  }, [trash, setHistory]);

  const setOrder = useCallback(
    (o: SortOrder) => {
      setOrderState(o);
      storage.saveOrder(o);
      reset(o);
    },
    [reset],
  );

  /** Forget which photos were kept, so they show up again. Trash is untouched. */
  const resetProgress = useCallback(() => {
    kept.current = new Set();
    storage.saveKept(kept.current);
    setKeptCount(0);
    setSessionStats({ kept: 0, deleted: 0 });
    reset(order);
  }, [order, reset]);

  return {
    ready,
    exhausted,
    queue,
    trash,
    keptCount,
    sessionStats,
    canUndo,
    order,
    decide,
    undo,
    restore,
    commitDelete,
    setOrder,
    resetProgress,
  };
}
