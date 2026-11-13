import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useCallback, useImperativeHandle, useRef, type Ref } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { colors } from './theme';
import type { Decision, Photo } from './types';

/** Horizontal distance (pt) past which releasing the card commits the decision. */
const SWIPE_THRESHOLD = 110;
/** A fast flick commits even if it hasn't travelled far. */
const VELOCITY_THRESHOLD = 900;
/** How many cards are rendered in the stack. */
const VISIBLE = 3;

export type SwipeDeckHandle = { swipe: (d: Decision) => void };

type DeckProps = {
  photos: Photo[];
  onDecision: (photo: Photo, decision: Decision) => void;
  ref?: Ref<SwipeDeckHandle>;
};

export function SwipeDeck({ photos, onDecision, ref }: DeckProps) {
  // The top card writes its x-offset here so the cards behind can grow into place.
  const progress = useSharedValue(0);
  // Which card `progress` belongs to — stops a stale value leaking onto the next top card.
  const owner = useSharedValue<string | null>(null);
  const topRef = useRef<SwipeDeckHandle>(null);

  useImperativeHandle(ref, () => ({ swipe: (d) => topRef.current?.swipe(d) }), []);

  const visible = photos.slice(0, VISIBLE);
  const topId = visible[0]?.id ?? null;

  return (
    <View style={styles.deck}>
      {visible
        .map((photo, i) => (
          <Card
            key={photo.id}
            ref={i === 0 ? topRef : undefined}
            photo={photo}
            index={i}
            topId={topId}
            progress={progress}
            owner={owner}
            onDecision={onDecision}
          />
        ))
        .reverse() /* render bottom-most first so the top card sits on top */}
    </View>
  );
}

type CardProps = {
  photo: Photo;
  index: number;
  topId: string | null;
  progress: SharedValue<number>;
  owner: SharedValue<string | null>;
  onDecision: (photo: Photo, decision: Decision) => void;
  ref?: Ref<SwipeDeckHandle>;
};

function Card({ photo, index, topId, progress, owner, onDecision, ref }: CardProps) {
  const { width } = useWindowDimensions();
  const isTop = index === 0;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const leaving = useSharedValue(false);
  const pastThreshold = useSharedValue(0); // -1 / 0 / 1

  const flyOutX = width * 1.5;

  const commit = useCallback(
    (d: Decision) => {
      Haptics.impactAsync(
        d === 'delete' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
      onDecision(photo, d);
    },
    [onDecision, photo],
  );

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);

  // Programmatic swipe (buttons).
  useImperativeHandle(
    ref,
    () => ({
      swipe: (d: Decision) => {
        if (leaving.get()) return;
        leaving.set(true);
        y.set(withTiming(-30, { duration: 260 }));
        x.set(
          withTiming(d === 'keep' ? flyOutX : -flyOutX, { duration: 260 }, (done) => {
            'worklet';
            if (done) scheduleOnRN(commit, d);
          }),
        );
      },
    }),
    [commit, flyOutX, leaving, x, y],
  );

  // Mirror the top card's position into the shared deck progress.
  useAnimatedReaction(
    () => (isTop ? x.get() : null),
    (val) => {
      if (val === null) return;
      owner.set(photo.id);
      progress.set(val);

      const zone = val > SWIPE_THRESHOLD ? 1 : val < -SWIPE_THRESHOLD ? -1 : 0;
      if (zone !== pastThreshold.get()) {
        if (zone !== 0 && !leaving.get()) scheduleOnRN(tick);
        pastThreshold.set(zone);
      }
    },
    [isTop, photo.id],
  );

  const pan = usePanGesture({
    enabled: isTop,
    onUpdate: (e) => {
      'worklet';
      if (leaving.get()) return;
      x.set(e.translationX);
      y.set(e.translationY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (leaving.get()) return;
      const goRight = e.translationX > SWIPE_THRESHOLD || e.velocityX > VELOCITY_THRESHOLD;
      const goLeft = e.translationX < -SWIPE_THRESHOLD || e.velocityX < -VELOCITY_THRESHOLD;

      if (goRight || goLeft) {
        leaving.set(true);
        const d: Decision = goRight ? 'keep' : 'delete';
        // Carry the flick's momentum: faster flick → shorter animation.
        const speed = Math.max(Math.abs(e.velocityX), 1200);
        const duration = Math.min(320, (flyOutX / speed) * 1000);
        y.set(withTiming(y.get() + e.velocityY * 0.1, { duration }));
        x.set(
          withTiming(goRight ? flyOutX : -flyOutX, { duration }, (done) => {
            'worklet';
            if (done) scheduleOnRN(commit, d);
          }),
        );
      } else {
        x.set(withSpring(0, { damping: 18, stiffness: 220 }));
        y.set(withSpring(0, { damping: 18, stiffness: 220 }));
      }
    },
  });

  const cardStyle = useAnimatedStyle(() => {
    if (isTop) {
      const rotate = interpolate(x.get(), [-width, 0, width], [-14, 0, 14]);
      return {
        transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${rotate}deg` }],
      };
    }
    // Cards behind grow towards the next slot as the top card is dragged away.
    const p =
      owner.get() === topId
        ? interpolate(Math.abs(progress.get()), [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP)
        : 0;
    const slot = index - p;
    return {
      transform: [{ translateY: slot * 14 }, { scale: 1 - slot * 0.05 }],
      opacity: index >= VISIBLE - 1 ? interpolate(p, [0, 1], [0.6, 1]) : 1,
    };
  });

  const keepStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [20, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP),
  }));
  const deleteStamp = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-SWIPE_THRESHOLD, -20], [1, 0], Extrapolation.CLAMP),
  }));
  const keepTint = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [0, SWIPE_THRESHOLD * 1.5], [0, 0.25], Extrapolation.CLAMP),
  }));
  const deleteTint = useAnimatedStyle(() => ({
    opacity: interpolate(x.get(), [-SWIPE_THRESHOLD * 1.5, 0], [0.25, 0], Extrapolation.CLAMP),
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Image
          source={{ uri: photo.id }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          recyclingKey={photo.id}
          transition={120}
          cachePolicy="memory"
        />

        <Animated.View pointerEvents="none" style={[styles.tint, { backgroundColor: colors.keep }, keepTint]} />
        <Animated.View pointerEvents="none" style={[styles.tint, { backgroundColor: colors.delete }, deleteTint]} />

        <Animated.View style={[styles.stamp, styles.stampKeep, keepStamp]}>
          <Ionicons name="heart" size={22} color={colors.keep} />
          <Text style={[styles.stampText, { color: colors.keep }]}>KEEP</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampDelete, deleteStamp]}>
          <Ionicons name="trash" size={22} color={colors.delete} />
          <Text style={[styles.stampText, { color: colors.delete }]}>DELETE</Text>
        </Animated.View>

        {photo.creationTime !== null && (
          <View style={styles.datePill}>
            <Text style={styles.dateText}>{formatDate(photo.creationTime)}</Text>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 18,
  },
  card: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tint: {
    ...StyleSheet.absoluteFill,
  },
  stamp: {
    position: 'absolute',
    top: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  stampKeep: {
    left: 22,
    borderColor: colors.keep,
    transform: [{ rotate: '-12deg' }],
  },
  stampDelete: {
    right: 22,
    borderColor: colors.delete,
    transform: [{ rotate: '12deg' }],
  },
  stampText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  datePill: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  dateText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
