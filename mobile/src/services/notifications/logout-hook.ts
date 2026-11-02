// The root notification lifecycle installs this hook; auth remains usable without native push.
let beforeLogout: ((userId: string) => Promise<void>) | undefined;
export function setNotificationLogoutHook(hook: typeof beforeLogout) {
  beforeLogout = hook;
}
export async function cleanupNotificationsBeforeLogout(userId: string | undefined) {
  if (userId)
    await beforeLogout?.(userId);
}
