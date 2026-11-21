import { render, screen } from '@testing-library/react-native';
import { PriceSuggestions } from '../components/price-suggestions';

it.each(['', '0', '000', 'invalid', '999999999999999999999'])('offers no prices for unusable input %s', (value) => {
  render(<PriceSuggestions value={value} maxAmount={500000000} onSelect={jest.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
});

it('omits prices above the form limit and offers the exact limit', () => {
  render(<PriceSuggestions value="50" maxAmount={500000} onSelect={jest.fn()} />);
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Chọn giá 50.000 đ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Chọn giá 500.000 đ' })).toBeTruthy();
});

it('offers larger amounts when the user has already typed thousands', () => {
  render(<PriceSuggestions value="23000" maxAmount={500000000} onSelect={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Chọn giá 230.000 đ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Chọn giá 2.300.000 đ' })).toBeTruthy();
});

it('hides quick price actions while editing is disabled', () => {
  render(<PriceSuggestions value="23" maxAmount={500000000} disabled onSelect={jest.fn()} />);
  expect(screen.queryByRole('button')).toBeNull();
});
