import type { ReactElement, ReactNode } from 'react';
import type { RefreshControlProps, ViewStyle } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';
import { ScrollView, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { FocusAwareStatusBar } from './focus-aware-status-bar';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export type ScreenProps = {
  children: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  safeArea?: boolean;
  edges?: readonly Edge[];
  className?: string;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  bottomOffset?: number;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  refreshControl?: ReactElement<RefreshControlProps>;
};

export function Screen({
  children,
  scrollable = false,
  keyboardAware = true,
  safeArea = true,
  edges,
  className = '',
  style,
  contentContainerStyle,
  bottomOffset = 60,
  keyboardShouldPersistTaps = 'handled',
  refreshControl,
}: ScreenProps) {
  const Container = safeArea ? StyledSafeAreaView : View;

  const renderContent = () => {
    if (!scrollable) {
      return (
        <View className="flex-1" style={[{ flex: 1 }, contentContainerStyle]}>
          {children}
        </View>
      );
    }

    if (keyboardAware) {
      return (
        <KeyboardAwareScrollView
          className="flex-1"
          style={{ flex: 1 }}
          contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          bottomOffset={bottomOffset}
          refreshControl={refreshControl}
        >
          {children}
        </KeyboardAwareScrollView>
      );
    }

    return (
      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  };

  return (
    <Container
      {...(safeArea && edges ? { edges } : {})}
      className={`flex-1 bg-white dark:bg-neutral-950 ${className}`}
      style={[{ flex: 1 }, style]}
    >
      <FocusAwareStatusBar />
      {renderContent()}
    </Container>
  );
}
