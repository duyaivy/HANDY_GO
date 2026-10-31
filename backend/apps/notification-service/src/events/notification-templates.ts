import type { NotificationEventType } from './event-contracts.js';

export type RecipientRole =
  'customer' | 'worker' | 'payer' | 'recipient' | 'owner';

export interface NotificationTemplate {
  title: string;
  body: string;
}

const templates = {
  'matching.eligible_workers.ready': [
    'Có công việc mới phù hợp',
    'Một yêu cầu dịch vụ phù hợp với bạn vừa xuất hiện.',
  ],
  'matching.completed': [
    'Đã tìm thấy thợ phù hợp',
    'Hệ thống đã hoàn tất tìm kiếm thợ phù hợp cho yêu cầu của bạn.',
  ],
  'bid.submitted': [
    'Bạn có báo giá mới',
    'Một thợ vừa gửi báo giá cho yêu cầu của bạn.',
  ],
  'bid.revised': [
    'Báo giá đã được cập nhật',
    'Một thợ vừa cập nhật báo giá cho yêu cầu của bạn.',
  ],
  'booking_proposal.created': [
    'Có lời đề nghị làm việc',
    'Bạn vừa nhận được một lời đề nghị từ khách hàng.',
  ],
  'booking_proposal.changes_requested': [
    'Đề nghị cần điều chỉnh',
    'Thợ đã yêu cầu thay đổi lời đề nghị của bạn.',
  ],
  'booking_proposal.rejected': [
    'Lời đề nghị bị từ chối',
    'Thợ đã từ chối lời đề nghị của bạn.',
  ],
  'order.created': [
    'Đơn hàng đã được xác nhận',
    '{{audience}} đã được tạo thành công.',
  ],
  'order.status.changed': [
    'Đơn hàng có cập nhật',
    '{{audience}} vừa có cập nhật trạng thái.',
  ],
  'order.cancelled': ['Đơn hàng đã bị hủy', '{{audience}} đã được hủy.'],
  'order.completed': ['Công việc đã hoàn thành', '{{audience}} đã hoàn thành.'],
  'payment.succeeded': [
    'Thanh toán thành công',
    'Giao dịch của bạn đã thành công.',
  ],
  'payment.failed': [
    'Thanh toán thất bại',
    'Giao dịch của bạn chưa thành công.',
  ],
  'payment.refunded': [
    'Hoàn tiền thành công',
    'Giao dịch của bạn đã được hoàn tiền.',
  ],
  'wallet.credited': ['Số dư ví tăng', 'Ví HandyGo của bạn vừa được ghi có.'],
  'wallet.debited': ['Số dư ví giảm', 'Ví HandyGo của bạn vừa được ghi nợ.'],
  'wallet.balance.adjusted': [
    'Số dư ví được điều chỉnh',
    'Số dư ví của bạn vừa được cập nhật.',
  ],
} satisfies Record<NotificationEventType, readonly [string, string]>;

export function renderNotificationTemplate(
  type: NotificationEventType,
  role: RecipientRole,
  transitionTemplate?: NotificationTemplate,
) {
  const [title, template] =
    type === 'order.status.changed' && transitionTemplate
      ? [transitionTemplate.title, transitionTemplate.body]
      : templates[type];
  const variables: Record<string, string> = {
    audience: role === 'worker' ? 'Công việc bạn nhận' : 'Đơn hàng của bạn',
  };
  const body = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in variables)) throw new Error('UNKNOWN_TEMPLATE_VARIABLE');
    return variables[key];
  });
  return { title, body };
}
