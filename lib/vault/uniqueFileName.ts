/**
 * Generates a unique file name by adding (1), (2), etc. if duplicates exist
 */
export function getUniqueFileName(
  originalName: string,
  existingFiles: Array<{ name: string; parentFolderId?: string | null }>,
  currentFolderId?: string | null
): string {
  // Get files in the same folder
  const filesInSameFolder = existingFiles.filter(
    (f) => f.parentFolderId === currentFolderId
  );

  // Extract file name and extension
  const lastDotIndex = originalName.lastIndexOf('.');
  const nameWithoutExt = lastDotIndex > 0 ? originalName.substring(0, lastDotIndex) : originalName;
  const extension = lastDotIndex > 0 ? originalName.substring(lastDotIndex) : '';

  // Check if the original name exists
  let newName = originalName;
  let counter = 1;

  while (filesInSameFolder.some((f) => f.name === newName)) {
    newName = `${nameWithoutExt} (${counter})${extension}`;
    counter++;
  }

  return newName;
}