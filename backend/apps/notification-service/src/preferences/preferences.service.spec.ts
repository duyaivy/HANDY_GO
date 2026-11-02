import { PreferencesService } from './preferences.service.js';
import type { PreferencesRepository } from './preferences.repository.js';

describe('PreferencesService', () => {
  const repository = { find: vi.fn(), update: vi.fn() };
  const service = new PreferencesService(
    repository as unknown as PreferencesRepository,
  );
  beforeEach(() => vi.resetAllMocks());

  it('returns schema defaults without writing on GET', async () => {
    repository.find.mockResolvedValue(null);
    expect(await service.get('owner')).toEqual({
      pushEnabled: true,
      inAppEnabled: true,
      emailEnabled: false,
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('preserves configured values', async () => {
    const saved = {
      pushEnabled: false,
      inAppEnabled: false,
      emailEnabled: true,
    };
    repository.find.mockResolvedValue(saved);
    expect(await service.get('owner')).toEqual(saved);
  });

  it('rejects an empty patch', () => {
    expect(() => service.update('owner', {})).toThrow('At least one');
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('accepts explicit false without overwriting omitted channels', async () => {
    await service.update('owner', { pushEnabled: false });
    expect(repository.update).toHaveBeenCalledWith('owner', {
      pushEnabled: false,
    });
  });
});
