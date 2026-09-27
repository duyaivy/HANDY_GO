import * as React from 'react';
import { Image } from 'react-native';

const logo = require('../../assets/icon.png');

export function BrandLogo({ size = 112 }: { size?: number }) {
  return (
    <Image
      testID="handy-go-logo"
      source={logo}
      accessibilityLabel="Logo HANDY GO"
      accessibilityRole="image"
      resizeMode="contain"
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    />
  );
}
