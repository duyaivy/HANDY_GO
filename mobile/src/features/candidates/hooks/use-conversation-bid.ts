import type { BidCandidate } from '../types/candidate.types';
import { useQuery } from '@tanstack/react-query';
import { CandidatesApi } from '../api/candidates.api';
import { candidateQueryKeys } from './candidate-query-keys';

export async function fetchConversationBid(requestId: string, workerId: string, signal: AbortSignal): Promise<BidCandidate | null> {
  for (let page = 1; ; page++) {
    const data = await CandidatesApi.getCandidatesData(requestId, { page, limit: 20 }, signal);
    const bidding = data.bidding;
    if (bidding.status === 'unavailable')
      throw new Error('Không tải được báo giá. Vui lòng thử lại.');

    const bid = bidding.items.find(item => item.workerUserId === workerId || item.workerId === workerId);
    if (bid)
      return bid;

    if (bidding.page !== page || bidding.limit <= 0)
      throw new Error('Dữ liệu phân trang báo giá không hợp lệ.');
    if (page * bidding.limit >= bidding.total)
      return null;
    if (bidding.items.length === 0)
      throw new Error('Danh sách báo giá chưa đầy đủ. Vui lòng tải lại.');
  }
}

export function useConversationBid(requestId: string, workerId: string, enabled = true) {
  return useQuery({
    queryKey: candidateQueryKeys.conversationBid(requestId, workerId),
    enabled: enabled && Boolean(requestId && workerId),
    queryFn: ({ signal }) => fetchConversationBid(requestId, workerId, signal),
  });
}
