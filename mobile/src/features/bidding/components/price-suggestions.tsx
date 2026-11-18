import { Pressable, Text, View } from 'react-native';

type PriceSuggestionsProps = {
  value: string;
  maxAmount: number;
  disabled?: boolean;
  onSelect: (value: string) => void;
};

export function PriceSuggestions({ value, maxAmount, disabled, onSelect }: PriceSuggestionsProps) {
  const amount = Number(value);
  if (disabled || !Number.isSafeInteger(amount) || amount <= 0)
    return null;

  const multiplier = amount < 1000 ? 1000 : 10;
  const suggestions = [multiplier, multiplier * 10, multiplier * 100]
    .map(factor => amount * factor)
    .filter(price => Number.isSafeInteger(price) && price <= maxAmount);

  if (suggestions.length === 0)
    return null;

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>Chọn nhanh mức giá</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {suggestions.map((price) => {
          const label = `${price.toLocaleString('vi-VN')} đ`;
          return (
            <Pressable
              key={price}
              accessibilityRole="button"
              accessibilityLabel={`Chọn giá ${label}`}
              onPress={() => onSelect(String(price))}
              style={({ pressed }) => ({
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#BFDBFE',
                backgroundColor: pressed ? '#DBEAFE' : '#EFF6FF',
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#1D4ED8' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
