/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { WorkerProfileScreen, WorkerSettingsScreen, WorkerSkillsScreen } from '@/features/profile/worker';
import { WorkerBalanceScreen } from '@/features/wallet/worker';
import { WorkerProfessionAnalysisScreen } from '@/features/worker-application';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: mockBack,
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: any) => {
    cb();
  },
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    user: null,
    activeMode: null,
    isAuthenticated: false,
    isHydrated: true,
    isLoading: false,
    error: null,
    hydrationError: null,
  });
});

describe('worker Account Skeleton & Navigation Flow (Vua Thợ)', () => {
  describe('luồng A — HANDY_GO balance', () => {
    it('1. navigates from Tài khoản / Cá nhân to HANDY_GO balance when pressing balance card', () => {
      render(<WorkerProfileScreen />);

      const balanceCard = screen.getByTestId('profile-balance-card');
      expect(balanceCard).toBeOnTheScreen();
      expect(screen.getByText('HANDY_GO balance')).toBeOnTheScreen();

      fireEvent.press(balanceCard);
      expect(mockPush).toHaveBeenCalledWith('/worker/balance');
    });

    it('2. renders HANDY_GO balance skeleton with title and development notice', () => {
      render(<WorkerBalanceScreen />);

      expect(screen.getByText('HANDY_GO balance')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-balance-screen')).toBeOnTheScreen();
    });

    it('3. returns to Tài khoản / Cá nhân when pressing back button in HANDY_GO balance', () => {
      render(<WorkerBalanceScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('luồng B — Professional skills', () => {
    it('1. navigates from Tài khoản / Cá nhân to Professional skills when pressing skills item', () => {
      render(<WorkerProfileScreen />);

      const skillsItem = screen.getByTestId('profile-skills-item');
      expect(skillsItem).toBeOnTheScreen();
      expect(screen.getByText('Professional skills')).toBeOnTheScreen();

      fireEvent.press(skillsItem);
      expect(mockPush).toHaveBeenCalledWith('/worker/skills');
    });

    it('2. renders Professional skills skeleton with Add professional skills button', () => {
      render(<WorkerSkillsScreen />);

      expect(screen.getByText('Professional skills')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-skills-screen')).toBeOnTheScreen();
      expect(screen.getByTestId('add-professional-skills-btn')).toBeOnTheScreen();
    });

    it('3. navigates from Professional skills to Profession analysis when pressing Add professional skills', () => {
      render(<WorkerSkillsScreen />);

      const addSkillsBtn = screen.getByTestId('add-professional-skills-btn');
      fireEvent.press(addSkillsBtn);
      expect(mockPush).toHaveBeenCalledWith('/worker/application/analysis');
    });

    it('4. automatically returns from Profession analysis after analysis completes without fake timers', () => {
      render(<WorkerProfessionAnalysisScreen autoReturn={true} />);

      expect(screen.getByTestId('worker-profession-analysis-screen')).toBeOnTheScreen();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('5. returns to Tài khoản / Cá nhân when pressing back button in Professional skills', () => {
      render(<WorkerSkillsScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('luồng C — Setting', () => {
    it('1. navigates from Tài khoản / Cá nhân to Setting when pressing Setting item', () => {
      render(<WorkerProfileScreen />);

      const settingItem = screen.getByTestId('profile-setting-item');
      expect(settingItem).toBeOnTheScreen();
      expect(screen.getByText('Setting')).toBeOnTheScreen();

      fireEvent.press(settingItem);
      expect(mockPush).toHaveBeenCalledWith('/worker/settings');
    });

    it('2. renders Setting skeleton with title and development notice', () => {
      render(<WorkerSettingsScreen />);

      expect(screen.getByText('Setting')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-settings-screen')).toBeOnTheScreen();
    });

    it('3. returns to Tài khoản / Cá nhân when pressing back button in Setting', () => {
      render(<WorkerSettingsScreen />);

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });
});
