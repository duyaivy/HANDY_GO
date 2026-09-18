import * as React from 'react';
import HomeScreen from '@/app/index';
import { cleanup, render, screen } from '@/lib/test-utils';

afterEach(cleanup);

describe('homeScreen Entry Point', () => {
  it('renders HANDYGO MOBILE title correctly', () => {
    render(<HomeScreen />);
    expect(screen.getByText('HANDYGO MOBILE')).toBeOnTheScreen();
  });

  it('renders Scaffold & Modular Base Architecture subtitle correctly', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Scaffold & Modular Base Architecture')).toBeOnTheScreen();
  });

  it('renders navigation buttons for Customer, Worker and Login', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('dev-demo-open-customer')).toBeOnTheScreen();
    expect(screen.getByTestId('dev-demo-open-worker')).toBeOnTheScreen();
    expect(screen.getByTestId('dev-demo-open-login')).toBeOnTheScreen();
  });

  it('renders base architecture info card', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Kiến trúc Nền tảng (Integration Rules)')).toBeOnTheScreen();
    expect(screen.getByText('Framework')).toBeOnTheScreen();
    expect(screen.getByText('TypeScript (Strict)')).toBeOnTheScreen();
    expect(screen.getByText('Single API Gateway')).toBeOnTheScreen();
  });
});
