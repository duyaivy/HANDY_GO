import * as React from 'react';
import HomeScreen from '@/app/index';
import { cleanup, render, screen } from '@/lib/test-utils';

afterEach(cleanup);

describe('homeScreen Entry Point', () => {
  it('renders HANDY GO Mobile title correctly', () => {
    render(<HomeScreen />);
    expect(screen.getByText('HANDY GO Mobile')).toBeOnTheScreen();
  });

  it('renders React Native base project subtitle correctly', () => {
    render(<HomeScreen />);
    expect(screen.getByText('React Native base project')).toBeOnTheScreen();
  });

  it('renders base architecture info card', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Base Architecture')).toBeOnTheScreen();
    expect(screen.getByText('Framework')).toBeOnTheScreen();
    expect(screen.getByText('TypeScript (Strict)')).toBeOnTheScreen();
  });
});
