import type { ServiceResponseDto } from '../types';
import * as React from 'react';

import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { ServiceCard } from '../components/service-card';
import { CategoryScreen } from '../screens/category-screen';

afterEach(cleanup);

const mockService: ServiceResponseDto = {
  id: 'srv-1',
  categoryId: 'cat-1',
  name: 'Sửa điều hòa tại nhà',
  description: 'Bảo dưỡng, nạp gas, sửa chữa máy lạnh mọi hãng.',
  iconUrl: 'https://example.com/icon.png',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  category: {
    id: 'cat-1',
    name: 'Điện Lạnh',
    imageUrl: null,
  },
};

describe('serviceCard', () => {
  it('renders grid variant correctly with service name', () => {
    const handleSelect = jest.fn();
    render(
      <ServiceCard
        service={mockService}
        onSelect={handleSelect}
        variant="grid"
        testID="service-card-grid"
      />,
    );

    expect(screen.getByText('Sửa điều hòa tại nhà')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('service-card-grid'));
    expect(handleSelect).toHaveBeenCalledWith(mockService.id, mockService);
  });

  it('renders category-grid variant for Stitch layout', () => {
    const handleSelect = jest.fn();
    render(
      <ServiceCard
        service={mockService}
        onSelect={handleSelect}
        variant="category-grid"
        testID="service-card-cat-grid"
      />,
    );

    expect(screen.getByText('Sửa điều hòa tại nhà')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('service-card-cat-grid'));
    expect(handleSelect).toHaveBeenCalledWith(mockService.id, mockService);
  });

  it('renders list variant with name and description', () => {
    const handleSelect = jest.fn();
    render(
      <ServiceCard
        service={mockService}
        onSelect={handleSelect}
        variant="list"
        testID="service-card-list"
      />,
    );

    expect(screen.getByText('Sửa điều hòa tại nhà')).toBeOnTheScreen();
    expect(screen.getByText('Bảo dưỡng, nạp gas, sửa chữa máy lạnh mọi hãng.')).toBeOnTheScreen();
    expect(screen.getByText('›')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('service-card-list'));
    expect(handleSelect).toHaveBeenCalledWith(mockService.id, mockService);
  });
});

describe('categoryScreen', () => {
  it('renders search bar, back navigation button, and AI banner matching Stitch design', () => {
    render(<CategoryScreen />);
    expect(screen.getByPlaceholderText('Bạn cần sửa gì hôm nay?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Quay lại')).toBeOnTheScreen();
    expect(screen.getByText('Chat với AI Vua Thợ')).toBeOnTheScreen();
    expect(screen.getByText('AI Pro')).toBeOnTheScreen();
  });
});
