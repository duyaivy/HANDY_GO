import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Image, Text } from '@/components/ui';

export type QuickActionItem = {
  id: string;
  label: string;
  sublabel: string;
  badge?: string;
  hasDot?: boolean;
  imageUri: string;
};


export type QuickActionsProps = {
  onSelectAction: (actionId: string) => void;
};

