import * as React from 'react';
import { PlaceholderScreen } from '@/components/placeholder-screen';

export function CustomerNotificationsScreen() {
  return (
    <PlaceholderScreen
      pageName="Thông báo"
      title="Thông báo"
      mode="stack"
      hideBackButton
      icon="🔔"
      testID="customer-notifications-screen"
    />
  );
}
