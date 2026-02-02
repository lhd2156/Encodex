'use client';

interface VaultEmptyProps {
  currentTab: string;
  currentFolderId?: string | null;
  showUploadMenu: boolean;
  setShowUploadMenu: (show: boolean) => void;
  onOpenUploadMenu?: (pos: { x: number; y: number; width?: number; height?: number } | null) => void;
}

export default function VaultEmpty({
  currentTab,
  currentFolderId,
  showUploadMenu,
  setShowUploadMenu,
  onOpenUploadMenu,
}: VaultEmptyProps) {
  return (
    <div className="flex min-h-full h-full w-full items-center justify-center">
      <div className="flex flex-col items-center justify-center w-full max-w-xs">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-gray-300 text-xl font-semibold mb-1">
          {currentTab === 'vault'
            ? currentFolderId
              ? 'Nothing in this folder — upload something?'
              : 'Nothing in your private vault yet'
            : 'Recycle bin is empty'}
        </p>
        {currentTab === 'vault' && (
          <>
            <p className="text-gray-400 text-sm mb-5">Drag and drop your files here</p>
            <button
              onClick={(e) => {
                if (onOpenUploadMenu) {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onOpenUploadMenu({ x: rect.left, y: rect.bottom, width: rect.width, height: rect.height });
                }
                setShowUploadMenu(true);
              }}
              className="px-7 py-3 rounded-lg bg-teal-500/90 hover:bg-teal-500 text-white font-semibold transition-colors shadow-md"
            >
              Upload
            </button>
          </>
        )}
      </div>
    </div>
  );
}
