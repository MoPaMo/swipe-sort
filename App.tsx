import { Ionicons } from '@expo/vector-icons';
import { presentPermissionsPicker, usePermissions } from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { getCategory } from './src/categories';
import { CategoryBar } from './src/CategoryBar';
import { SwipeDeck, type SwipeDeckHandle } from './src/SwipeDeck';
import { TrashReview } from './src/TrashReview';
import { colors } from './src/theme';
import { usePhotoQueue } from './src/usePhotoQueue';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const [permission, requestPermission] = usePermissions({ granularPermissions: ['photo'] });

  if (!permission) {
    return <Centered><ActivityIndicator color={colors.muted} /></Centered>;
  }

  if (!permission.granted) {
    return (
      <Centered>
        <Ionicons name="images-outline" size={64} color={colors.muted} />
        <Text style={styles.h1}>SwipeSort</Text>
        <Text style={styles.body}>
          Swipe right to keep, left to delete.{'\n'}Nothing is deleted until you confirm.
        </Text>
        <PrimaryButton
          label={permission.canAskAgain ? 'Allow photo access' : 'Open Settings'}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
      </Centered>
    );
  }

  return <Sorter limited={permission.accessPrivileges === 'limited'} />;
}

function Sorter({ limited }: { limited: boolean }) {
  const q = usePhotoQueue(true);
  const deck = useRef<SwipeDeckHandle>(null);
  const [trashOpen, setTrashOpen] = useState(false);

  const openOptions = useCallback(() => {
    Alert.alert('Options', undefined, [
      {
        text: q.order === 'newest' ? '✓ Newest first' : 'Newest first',
        onPress: () => q.order !== 'newest' && q.setOrder('newest'),
      },
      {
        text: q.order === 'oldest' ? '✓ Oldest first' : 'Oldest first',
        onPress: () => q.order !== 'oldest' && q.setOrder('oldest'),
      },
      {
        text: `Show ${q.keptCount} kept photos again`,
        onPress: q.resetProgress,
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [q]);

  const top = q.queue[0];
  const showInitialSpinner = !q.ready || (!q.exhausted && q.queue.length === 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>SwipeSort</Text>
          <Text style={styles.subtitle}>
            {q.sessionStats.kept} kept · {q.sessionStats.deleted} binned this session
          </Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton name="options-outline" onPress={openOptions} />
          <Pressable onPress={() => setTrashOpen(true)} hitSlop={8} style={styles.trashBtn}>
            <Ionicons name="trash-outline" size={22} color={colors.text} />
            {q.trash.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{q.trash.length > 999 ? '999+' : q.trash.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      {limited && (
        <Pressable style={styles.banner} onPress={() => presentPermissionsPicker(['photo']).catch(() => {})}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accent} />
          <Text style={styles.bannerText}>Limited access — tap to choose more photos</Text>
        </Pressable>
      )}

      <CategoryBar active={q.category} counts={q.counts} onSelect={q.setCategory} />

      {/* Deck */}
      {showInitialSpinner ? (
        <View style={styles.fill}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : top ? (
        <SwipeDeck ref={deck} photos={q.queue} onDecision={q.decide} />
      ) : (
        <View style={styles.fill}>
          <Ionicons name="sparkles-outline" size={56} color={colors.keep} />
          <Text style={styles.h1}>
            {q.category === 'all' ? 'All caught up' : `No more ${getCategory(q.category).label.toLowerCase()}`}
          </Text>
          <Text style={styles.body}>
            {q.trash.length > 0
              ? `${q.trash.length} photo${q.trash.length === 1 ? ' is' : 's are'} waiting to be deleted.`
              : q.category === 'all'
                ? 'Every photo has been reviewed.'
                : 'Pick another category above, or switch to All.'}
          </Text>
          {q.trash.length > 0 && (
            <PrimaryButton label="Review & delete" color={colors.delete} onPress={() => setTrashOpen(true)} />
          )}
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        <RoundButton
          icon="close"
          color={colors.delete}
          size={68}
          disabled={!top}
          onPress={() => deck.current?.swipe('delete')}
        />
        <RoundButton
          icon="arrow-undo"
          color={colors.accent}
          size={48}
          disabled={!q.canUndo}
          onPress={q.undo}
        />
        <RoundButton
          icon="heart"
          color={colors.keep}
          size={68}
          disabled={!top}
          onPress={() => deck.current?.swipe('keep')}
        />
      </View>

      <TrashReview
        visible={trashOpen}
        photos={q.trash}
        onClose={() => setTrashOpen(false)}
        onRestore={q.restore}
        onConfirmDelete={q.commitDelete}
      />
    </SafeAreaView>
  );
}

// ---- small UI pieces ----------------------------------------------------------

function Centered({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={[styles.screen, styles.fill]} edges={['top', 'bottom']}>
      {children}
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress, color = colors.text }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primary, { backgroundColor: color, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={[styles.primaryText, color === colors.text && { color: colors.bg }]}>{label}</Text>
    </Pressable>
  );
}

function IconButton({ name, onPress }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.iconBtn}>
      <Ionicons name={name} size={22} color={colors.text} />
    </Pressable>
  );
}

function RoundButton({
  icon,
  color,
  size,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  size: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          opacity: disabled ? 0.3 : 1,
          transform: [{ scale: pressed ? 0.92 : 1 }],
        },
      ]}
    >
      <Ionicons name={icon} size={size * 0.45} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 8,
  },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  trashBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.delete,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  bannerText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingBottom: 10,
  },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: colors.surface,
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  primary: {
    marginTop: 8,
    paddingHorizontal: 26,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
