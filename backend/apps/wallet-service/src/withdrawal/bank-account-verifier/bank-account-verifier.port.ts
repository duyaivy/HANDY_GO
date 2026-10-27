export abstract class BankAccountVerifier {
  abstract verify(userId: string, bankAccountId: string): Promise<boolean>;
}
