/** Chat content, private delivery URLs and upload signatures never enter API logs. */
export function privateApiPayload(url: string): boolean {
  return /(?:^|\/)conversations(?:\/|\?|$)|(?:^|\/)uploads(?:\/|\?|$)/.test(
    url,
  );
}
