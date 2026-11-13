import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from './theme';
import type { Photo } from './types';

const COLUMNS = 3;
const GAP = 3;

type Props = {
  visible: boolean;
  photos: Photo[];
  onClose: () => void;
  onRestore: (p: Photo) => void;
  onConfirmDelete: () => Promise<boolean>;
};

export function TrashReview({ visible, photos, onClose, onRestore, onConfirmDelete }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const size = (width - GAP * (COLUMNS - 1)) / COLUMNS;

  const handleDelete = async () => {
    setBusy(true);
    const ok = await onConfirmDelete();
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>To delete · {photos.length}</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        {photos.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>Nothing queued for deletion.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.hint}>Tap a photo to restore it.</Text>
            <FlatList
              data={photos}
              keyExtractor={(p) => p.id}
              numColumns={COLUMNS}
              columnWrapperStyle={{ gap: GAP }}
              contentContainerStyle={{ gap: GAP }}
              renderItem={({ item }) => (
                <Pressable onPress={() => onRestore(item)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Image
                    source={{ uri: item.id }}
                    style={{ width: size, height: size, backgroundColor: colors.card }}
                    contentFit="cover"
                    recyclingKey={item.id}
                  />
                  <View style={styles.restoreBadge}>
                    <Ionicons name="arrow-undo" size={14} color={colors.text} />
                  </View>
                </Pressable>
              )}
            />
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.deleteBtn, (pressed || busy) && { opacity: 0.7 }]}
                onPress={handleDelete}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteText}>
                    Delete {photos.length} photo{photos.length === 1 ? '' : 's'}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.footnote}>
                {Platform.OS === 'ios'
                  ? 'iOS will ask you to confirm. Photos go to “Recently Deleted” for 30 days.'
                  : 'Android will ask you to confirm. This deletes the photos permanently.'}
              </Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  done: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, paddingHorizontal: 20, paddingBottom: 10 },
  restoreBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: colors.muted, fontSize: 15 },
  footer: { paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  deleteBtn: {
    backgroundColor: colors.delete,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footnote: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
