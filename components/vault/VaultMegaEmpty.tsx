'use client';

import Image from 'next/image';

type VaultMegaEmptyProps = {
  onUploadFile: () => void;
  onUploadFolder: () => void;
  activeFilter?: string;
  showUploadButtons?: boolean;
};

export default function VaultMegaEmpty({ 
  onUploadFile, 
  onUploadFolder, 
  activeFilter,
  showUploadButtons = true 
}: VaultMegaEmptyProps) {
  const getEmptyMessage = () => {
    if (activeFilter === 'images') return 'No images found';
    if (activeFilter === 'videos') return 'No videos found';
    if (activeFilter === 'documents') return 'No documents found';
    if (activeFilter === 'folders') return 'No folders found';
    return 'No files yet';
  };

  const getEmptySubtext = () => {
    if (!showUploadButtons) {
      return 'Files you add to favourites will appear here';
    }
    if (activeFilter && activeFilter !== 'all') {
      return 'Try adjusting your filters';
    }
    return 'Upload your first file to get started';
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="mb-6 flex justify-center">
          <Image src="/encodex-folder.svg" alt="Empty folder" width={96} height={96} />
        </div>
        <h3 className="text-2xl font-bold text-white mb-3">{getEmptyMessage()}</h3>
        <p className="text-gray-400 mb-8">{getEmptySubtext()}</p>
        
        {showUploadButtons && (
          <div className="flex gap-4 justify-center">
            <button
              onClick={onUploadFile}
              className="px-6 py-3 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 font-semibold transition-colors flex items-center gap-2"
            >
              <Image src="/encodex-file.svg" alt="File" width={20} height={20} />
              Upload files
            </button>
            <button
              onClick={onUploadFolder}
              className="px-6 py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold transition-colors flex items-center gap-2"
            >
              <Image src="/encodex-folder-open.svg" alt="Folder" width={20} height={20} />
              Upload folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}