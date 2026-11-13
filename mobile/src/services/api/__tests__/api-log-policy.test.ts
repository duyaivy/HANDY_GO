import { privateApiPayload } from '../api-log-policy';

it('never logs private chat histories or upload signatures', () => {
  expect(privateApiPayload('/conversations/id/messages?afterSequence=1')).toBe(
    true,
  );
  expect(privateApiPayload('/uploads/video/init')).toBe(true);
  expect(privateApiPayload('/uploads/image')).toBe(true);
  expect(privateApiPayload('/orders')).toBe(false);
});
