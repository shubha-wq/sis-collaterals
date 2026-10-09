/**
 * Browsers may evict site storage under pressure, and Safari clears it after
 * about 7 days without a visit. Asking for persistent storage (granted
 * silently in Chrome/Edge for engaged sites, ignored elsewhere) reduces that
 * risk. It never prompts on its own and never throws.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export const LOGO_LIBRARY_HELP =
  "Your uploaded logos are saved in this browser and stay until you delete them or clear this site's data. " +
  "Teammates won't see them. Safari may clear them if you don't open the app for about a week.";
