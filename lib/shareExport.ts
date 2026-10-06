import { File, Paths } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';

import { exportFileName, serializeExport, type ExportPayload } from './exportData';

// The only side-effecting half of export: writes the payload to a file and hands it to
// the iOS share sheet (CLAUDE.md "Backup and export": "One button in settings: export
// everything as JSON to the iOS share sheet"). Kept apart from exportData.ts so the
// format itself stays a pure function with no Expo imports.
//
// Written to the CACHE directory, not documents. The share sheet copies (or uploads) the
// file wherever the user sends it, so this copy is a handoff artifact with no reason to
// survive — and cache is the one directory iOS is allowed to reclaim under storage
// pressure, which is the correct lifetime for it. Writing it to documents instead would
// silently accumulate a backup per export inside the app's own storage, which is both
// pointless and the opposite of a backup.
export async function shareExportPayload(payload: ExportPayload, exportedAt: Date): Promise<void> {
  const file = new File(Paths.cache, exportFileName(exportedAt));

  // Same-day re-export hits an existing filename, and `create` throws rather than
  // overwriting by default.
  if (file.exists) file.delete();
  file.create();
  file.write(serializeExport(payload));

  // Checked rather than assumed: `shareAsync` rejects on a platform with no share sheet,
  // and the caller needs to tell the difference between "the user dismissed the sheet"
  // and "this device can't do this at all" to show an honest message.
  if (!(await isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }

  await shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export Notch data',
  });
}
