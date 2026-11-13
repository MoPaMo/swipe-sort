import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CATEGORIES, type CategoryId } from './categories';
import { colors } from './theme';

type Props = {
  active: CategoryId;
  counts: Partial<Record<CategoryId, number>>;
  onSelect: (id: CategoryId) => void;
};

export function CategoryBar({ active, counts, onSelect }: Props) {
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {CATEGORIES.map((c) => {
          const selected = c.id === active;
          const count = counts[c.id];
          return (
            <Pressable
              key={c.id}
              onPress={() => onSelect(c.id)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={c.icon} size={15} color={selected ? colors.bg : colors.text} />
              <Text style={[styles.label, selected && styles.labelSelected]}>{c.label}</Text>
              {count !== undefined && (
                <Text style={[styles.count, selected && styles.countSelected]}>
                  {count > 9999 ? '9999+' : count}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  labelSelected: { color: colors.bg },
  count: { color: colors.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  countSelected: { color: colors.border },
});
