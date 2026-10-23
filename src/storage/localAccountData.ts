import { feedCacheRepository } from './feedCacheRepository';
import { feedExposureRepository } from './feedExposureRepository';
import { publishingDraftRepository } from './publishingDraftRepository';

/**
 * Removes every piece of locally stored data owned by the given account key.
 *
 * This is the single entry point for account removal cleanup: future
 * per-account tables (e.g. local recommendation signals) must be cleared
 * here as well.
 */
export async function clearLocalAccountData(accountKey: string): Promise<void> {
  await Promise.all([
    feedExposureRepository.clearAccount(accountKey),
    feedCacheRepository.clearAccountCache(accountKey),
    publishingDraftRepository.clearAccount(accountKey),
  ]);
}
