import ChangePasswordRoute from '@/app/(auth)/change-password';
import CompleteProfileRoute from '@/app/(auth)/complete-profile';
import CreatePinRoute from '@/app/(auth)/create-pin';
import { ChangePasswordScreen, CompleteProfileScreen, CreatePinScreen } from '@/features/auth';

describe('auth Route Re-exports', () => {
  it('correctly exports ChangePasswordScreen from change-password route', () => {
    expect(ChangePasswordRoute).toBe(ChangePasswordScreen);
  });

  it('correctly exports CreatePinScreen from create-pin route', () => {
    expect(CreatePinRoute).toBe(CreatePinScreen);
  });

  it('correctly exports CompleteProfileScreen from complete-profile route', () => {
    expect(CompleteProfileRoute).toBe(CompleteProfileScreen);
  });
});
