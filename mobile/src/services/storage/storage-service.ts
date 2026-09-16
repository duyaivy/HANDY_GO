import { storage } from '@/lib/storage';
import { Logger } from '@/services/logger/logger';

export type IStorageService = {
  getItem: <T>(key: string) => T | null;
  setItem: <T>(key: string, value: T) => void;
  removeItem: (key: string) => void;
  hasItem: (key: string) => boolean;
  clearAll: () => void;
};

class MMKVStorageService implements IStorageService {
  getItem<T>(key: string): T | null {
    try {
      const raw = storage.getString(key);
      if (!raw)
        return null;
      return JSON.parse(raw) as T;
    }
    catch (error) {
      Logger.error('StorageService', `Failed to get item for key: ${key}`, error);
      return null;
    }
  }

  setItem<T>(key: string, value: T): void {
    try {
      storage.set(key, JSON.stringify(value));
    }
    catch (error) {
      Logger.error('StorageService', `Failed to set item for key: ${key}`, error);
    }
  }

  removeItem(key: string): void {
    try {
      storage.remove(key);
    }
    catch (error) {
      Logger.error('StorageService', `Failed to remove item for key: ${key}`, error);
    }
  }

  hasItem(key: string): boolean {
    return storage.contains(key);
  }

  clearAll(): void {
    try {
      storage.clearAll();
    }
    catch (error) {
      Logger.error('StorageService', 'Failed to clear all storage', error);
    }
  }
}

export const StorageService: IStorageService = new MMKVStorageService();
