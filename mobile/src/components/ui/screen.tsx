import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { FocusAwareStatusBar } from './focus-aware-status-bar';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  safeArea?: boolean;
  className?: string;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
};

export function Screen({
  children,
  scrollable = false,
  safeArea = true,
  className = '',
  style,
  contentContainerStyle,
}: ScreenProps) {
  const Container = safeArea ? StyledSafeAreaView : View;

  return (
    <Container className={`flex-1 bg-white dark:bg-neutral-950 ${className}`} style={[{ flex: 1 }, style]}>
      <FocusAwareStatusBar />
      {scrollable
        ? (
            <ScrollView
              className="flex-1"
              style={{ flex: 1 }}
              contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          )
        : (
            <View className="flex-1" style={[{ flex: 1 }, contentContainerStyle]}>
              {children}
            </View>
          )}
    </Container>
  );
}
