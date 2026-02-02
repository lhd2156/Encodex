'use client';

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
        <div className="text-8xl mb-6">📁</div>
        <h3 className="text-2xl font-bold text-white mb-3">{getEmptyMessage()}</h3>
        <p className="text-gray-400 mb-8">{getEmptySubtext()}</p>
        
        {showUploadButtons && (
          <div className="flex gap-4 justify-center">
            <button
              onClick={onUploadFile}
              className="px-6 py-3 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-400 font-semibold transition-colors flex items-center gap-2"
            >
              📄 Upload files
            </button>
            <button
              onClick={onUploadFolder}
              className="px-6 py-3 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 font-semibold transition-colors flex items-center gap-2"
            >
              📂 Upload folder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}