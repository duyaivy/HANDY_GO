/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';

import WorkerWalletScreen from '../(tabs)/wallet';
import WorkerProfessionAnalysisScreen from '../application/analysis';
import WorkerCompleteRegistrationModal from '../application/complete-modal';
import WorkerRegisterProviderScreen from '../application/register';
import WorkerApplicationStatusScreen from '../application/status';
import WorkerBalanceScreen from '../balance';
import WorkerJobDetailScreen from '../jobs/[id]';
import WorkerJobCompleteScreen from '../jobs/[id]/complete';
import WorkerNotificationsScreen from '../notifications';
import WorkerSettingsScreen from '../settings';
import WorkerSkillsScreen from '../skills';
import WorkerWalletDepositScreen from '../wallet/deposit';
import WorkerWalletWithdrawScreen from '../wallet/withdraw';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { id: 'JOB-1020' };

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => mockParams),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockParams = { id: 'JOB-1020' };
});

describe('worker Skeleton & Route Flow', () => {
  describe('workerWalletScreen ((tabs)/wallet)', () => {
    it('renders clean placeholder with title and standard development notice', () => {
      render(<WorkerWalletScreen />);

      expect(screen.getByText('Ví & Thu nhập')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-wallet-screen')).toBeOnTheScreen();
    });
  });

  describe('workerJobDetailScreen (jobs/[id])', () => {
    it('renders placeholder job frame with title, order id subtitle, and development notice', () => {
      render(<WorkerJobDetailScreen />);

      expect(screen.getByText('Chi tiết đơn việc')).toBeOnTheScreen();
      expect(screen.getByText('Mã đơn: #JOB-1020')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerJobCompleteScreen (jobs/[id]/complete)', () => {
    it('renders placeholder with title and handles navigation back', () => {
      render(<WorkerJobCompleteScreen />);

      expect(screen.getByText('Nghiệm thu công việc')).toBeOnTheScreen();
      expect(screen.getByText('Đơn việc #JOB-1020')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerWalletDepositScreen (wallet/deposit)', () => {
    it('renders deposit placeholder with title and back button', () => {
      render(<WorkerWalletDepositScreen />);

      expect(screen.getByText('Nạp tiền ví ký quỹ')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerWalletWithdrawScreen (wallet/withdraw)', () => {
    it('renders withdraw placeholder with title and back button', () => {
      render(<WorkerWalletWithdrawScreen />);

      expect(screen.getByText('Rút tiền về ngân hàng')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerApplicationStatusScreen (application/status)', () => {
    it('renders clean placeholder without mock data, and functional back button', () => {
      render(<WorkerApplicationStatusScreen />);

      expect(screen.getByText('Tiến độ duyệt hồ sơ')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.queryByText('Đang xét duyệt hồ sơ')).toBeNull();
      expect(screen.queryByTestId('application-step-1')).toBeNull();
      expect(screen.queryByTestId('application-step-2')).toBeNull();
      expect(screen.queryByText('Văn phòng hỗ trợ đối tác Thợ Đà Nẵng')).toBeNull();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerNotificationsScreen (notifications)', () => {
    it('renders notification inbox for worker with back button', () => {
      render(<WorkerNotificationsScreen />);

      expect(screen.getByText('Thông báo Thợ')).toBeOnTheScreen();
      expect(screen.getByText('Đăng nhập để xem thông báo')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-notifications-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerRegisterProviderScreen (application/register)', () => {
    it('renders onboarding placeholder with back button', () => {
      render(<WorkerRegisterProviderScreen />);

      expect(screen.getByText('Đăng ký đối tác Thợ')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-register-provider-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerProfessionAnalysisScreen (application/analysis)', () => {
    it('renders profession analysis placeholder with back button', () => {
      render(<WorkerProfessionAnalysisScreen autoReturn={false} />);

      expect(screen.getByText('Phân tích nghề nghiệp')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-profession-analysis-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });

    it('automatically navigates back when analysis finishes without fake timers', () => {
      mockBack.mockClear();
      render(<WorkerProfessionAnalysisScreen autoReturn={true} />);

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('workerBalanceScreen (balance)', () => {
    it('renders balance placeholder and navigates back via app-bar', () => {
      render(<WorkerBalanceScreen />);

      expect(screen.getByText('HANDY_GO balance')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-balance-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerSkillsScreen (skills)', () => {
    it('renders skills placeholder, navigates back and pushes to profession analysis', () => {
      render(<WorkerSkillsScreen />);

      expect(screen.getByText('Professional skills')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-skills-screen')).toBeOnTheScreen();

      // Test Add professional skills button
      const addBtn = screen.getByTestId('add-professional-skills-btn');
      expect(addBtn).toBeOnTheScreen();
      fireEvent.press(addBtn);
      expect(mockPush).toHaveBeenCalledWith('/worker/application/analysis');

      // Test Back button
      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerSettingsScreen (settings)', () => {
    it('renders settings placeholder and navigates back via app-bar', () => {
      render(<WorkerSettingsScreen />);

      expect(screen.getByText('Setting')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-settings-screen')).toBeOnTheScreen();

      const backBtn = screen.getByTestId('app-bar-back-btn');
      fireEvent.press(backBtn);
      expect(mockBack).toHaveBeenCalled();
    });
  });

  describe('workerCompleteRegistrationModal (application/complete-modal)', () => {
    it('renders registration reminder modal and handles close button and icon', () => {
      render(<WorkerCompleteRegistrationModal />);

      expect(screen.getByText('Hoàn thiện hồ sơ đăng ký')).toBeOnTheScreen();
      expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-complete-registration-modal')).toBeOnTheScreen();

      // Close modal button
      fireEvent.press(screen.getByTestId('complete-modal-close-btn'));
      expect(mockBack).toHaveBeenCalledTimes(1);

      // Close icon
      fireEvent.press(screen.getByTestId('complete-modal-close-icon'));
      expect(mockBack).toHaveBeenCalledTimes(2);
    });
  });
});
