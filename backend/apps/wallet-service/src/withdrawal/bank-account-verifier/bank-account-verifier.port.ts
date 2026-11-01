export abstract class BankAccountVerifier {
  /**
   * true: tài khoản thuộc user và user đang active (chưa chứng minh ngân hàng đã xác minh tài khoản).
   * false: bị từ chối rõ ràng. Ném AppException 503 khi chưa xác minh được (có thể retry).
   */
  abstract verify(userId: string, bankAccountId: string): Promise<boolean>;
}
