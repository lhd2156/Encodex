'use client';

import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Don't configure worker here - we'll do it in useEffect after mount

// RenameModal Component (inline)
function RenameModal({ 
  isOpen, 
  onClose, 
  currentName, 
  onRename,
  itemType 
}: {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (newName: string) => void;
  itemType: 'file' | 'folder';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Select only the filename without extension
          const lastDotIndex = currentName.lastIndexOf('.');
          if (lastDotIndex > 0 && itemType === 'file') {
            inputRef.current.setSelectionRange(0, lastDotIndex);
          } else {
            inputRef.current.select();
          }
        }
      }, 0);
    }
  }, [isOpen, currentName, itemType]);

  const handleRename = () => {
    const trimmedName = name.trim();
    if (trimmedName) {
      onRename(trimmedName);
    } else {
      }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 z-[60] backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] w-full max-w-md px-4">
        <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-700">
            <h2 className="text-lg font-medium text-white">
              Rename
            </h2>
          </div>

          {/* Content */}
          <div className="p-6">
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Enter name..."
            />
          </div>

          {/* Footer */}
          <div className="px-6 py-4 flex gap-3 justify-end border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-lg bg-transparent hover:bg-gray-700 text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors text-sm font-medium"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Helper function to split DOCX HTML into pages
function splitDocxIntoPages(html: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;
  
  const pages: string[] = [];
  let currentPage: HTMLElement[] = [];
  let currentHeight = 0;
  
  // Approximate page height in pixels (8.5x11 at 96 DPI with margins)
  const PAGE_HEIGHT = 1056; // ~11 inches at 96 DPI
  const LINE_HEIGHT_ESTIMATE = 24; // Approximate line height
  
  const elements = Array.from(body.children);
  
  for (const element of elements) {
    const el = element as HTMLElement;
    
    // Estimate element height based on tag type
    let estimatedHeight = LINE_HEIGHT_ESTIMATE;
    
    if (el.tagName === 'H1') {
      estimatedHeight = 48;
    } else if (el.tagName === 'H2') {
      estimatedHeight = 36;
    } else if (el.tagName === 'H3') {
      estimatedHeight = 30;
    } else if (el.tagName === 'P') {
      // Count lines based on text length
      const textLength = el.textContent?.length || 0;
      const estimatedLines = Math.ceil(textLength / 80); // ~80 chars per line
      estimatedHeight = estimatedLines * LINE_HEIGHT_ESTIMATE;
    } else if (el.tagName === 'UL' || el.tagName === 'OL') {
      const items = el.querySelectorAll('li').length;
      estimatedHeight = items * LINE_HEIGHT_ESTIMATE * 1.5;
    } else if (el.tagName === 'TABLE') {
      const rows = el.querySelectorAll('tr').length;
      estimatedHeight = rows * 40; // Estimate 40px per row
    }
    
    // Check if adding this element would exceed page height
    if (currentHeight + estimatedHeight > PAGE_HEIGHT && currentPage.length > 0) {
      // Save current page
      const pageDiv = document.createElement('div');
      currentPage.forEach(el => pageDiv.appendChild(el.cloneNode(true)));
      pages.push(pageDiv.innerHTML);
      
      // Start new page
      currentPage = [el];
      currentHeight = estimatedHeight;
    } else {
      currentPage.push(el);
      currentHeight += estimatedHeight;
    }
  }
  
  // Add final page
  if (currentPage.length > 0) {
    const pageDiv = document.createElement('div');
    currentPage.forEach(el => pageDiv.appendChild(el.cloneNode(true)));
    pages.push(pageDiv.innerHTML);
  }
  
  // Ensure at least one page
  return pages.length > 0 ? pages : [html];
}

interface FileItem {
  id: string;
  name: string;
  size: number;
  type: 'file' | 'folder';
  createdAt: Date;
  parentFolderId?: string | null;
  isFavorite?: boolean;
}

interface FileViewerProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileId: string;
  isFavorite: boolean;
  allFiles: FileItem[];
  currentFolderId: string | null;
  onClose: () => void;
  onToggleFavorite: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onNavigate: (fileId: string) => void;
  onRename?: (fileId: string, newName: string) => void;
}

export default function FileViewer({ 
  fileUrl, 
  fileName, 
  fileType, 
  fileId,
  isFavorite: initialIsFavorite,
  allFiles,
  currentFolderId,
  onClose,
  onToggleFavorite,
  onDelete,
  onNavigate,
  onRename
}: FileViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');
  const [docxHtml, setDocxHtml] = useState<string>('');
  const [docxPages, setDocxPages] = useState<string[]>([]);
  const [zoom, setZoom] = useState<number>(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showBars, setShowBars] = useState(true);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Sync local isFavorite state when prop changes (e.g., after API update)
  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);
  
  // PDF-specific state
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [rotation, setRotation] = useState<number>(0);
  const [showPdfMenu, setShowPdfMenu] = useState(false);
  const [toolMode, setToolMode] = useState<'text' | 'hand'>('hand');
  const [pdfScale, setPdfScale] = useState(1.5); // Default 150% actual = "100%" displayed
  const [searchMatches, setSearchMatches] = useState<Array<{pageNum: number, matchIndex: number}>>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isManuallyScrolling, setIsManuallyScrolling] = useState(false);
  const [pageThumbnails, setPageThumbnails] = useState<Map<number, string>>(new Map());
  const [reloadKey, setReloadKey] = useState(0);
  
  // Drag scrolling state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const zoomMenuRef = useRef<HTMLDivElement>(null);
  const pdfMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Helper function to determine file category - MUST be defined before use
  const getFileCategory = (name: string): string => {
    const ext = name.toLowerCase().split('.').pop() || '';
    
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx'].includes(ext)) return 'docx';
    if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
    if (['ppt', 'pptx'].includes(ext)) return 'pptx';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(ext)) return 'audio';
    if (['txt', 'md', 'json', 'csv', 'log', 'xml', 'html', 'css', 'js', 'ts', 'tsx', 'jsx'].includes(ext)) return 'text';
    
    return 'unknown';
  };

  // Determine file category and if it's a document viewer type
  const category = getFileCategory(fileName);
  const isDocumentViewer = category === 'pdf' || category === 'docx' || category === 'pptx' || category === 'xlsx';

  // Sync favorite state when it changes externally
  useEffect(() => {
    setIsFavorite(initialIsFavorite);
  }, [initialIsFavorite]);

  // Setup PDF.js worker after component mounts
  useEffect(() => {
    // Force clear any existing worker configuration
    if (typeof window !== 'undefined') {
      // Get the actual version from pdfjs
      const version = pdfjs.version;
      // Build worker URL with the detected version
      const workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
      
      // Force set the worker source (overwrite any existing)
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      
      }
  }, []);

  // Ensure react-pdf TextLayer/AnnotationLayer styles exist (inject runtime <style> to satisfy library checks)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const STYLE_ID = 'react-pdf-runtime-styles';
    if (document.getElementById(STYLE_ID)) return;

    try {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.innerHTML = `
        .react-pdf__Page__annotations, .react-pdf__AnnotationLayer, .react-pdf__Page__annotationLayer {
          position: absolute; left:0; top:0; height:100%; width:100%; pointer-events:auto;
        }
        .react-pdf__Page__textContent, .react-pdf__TextLayer, .react-pdf__Page__textLayer {
          position:absolute; left:0; top:0; right:0; bottom:0; color: transparent; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
        }
        .react-pdf__Page__textContent > span, .react-pdf__TextLayer span { display:inline-block; transform-origin:0 0; white-space:pre; pointer-events:none; }
        .react-pdf__Page canvas { display:block; max-width:100%; }
      `;

      document.head.appendChild(style);
      
      // Silence react-pdf warnings in production
      const IGNORED_PATTERNS: RegExp[] = [ /TextLayer styles not found/, /AnnotationLayer styles not found/ ];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origError = (console as any).error?.bind(console);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const origWarn = (console as any).warn?.bind(console);

      function shouldIgnoreMessage(msg: string) {
        return IGNORED_PATTERNS.some((p) => p.test(msg));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function makeFiltered(orig: ((...args: any[]) => void) | undefined) {
        if (!orig) return () => {};
        return (...args: unknown[]) => {
          try {
            const first = args[0];
            const text = typeof first === 'string' ? first : JSON.stringify(first);
            if (shouldIgnoreMessage(text)) {
              return; // Silently ignore matching messages
            }
          } catch {
            // Fall back to original
          }
          orig(...args);
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any).error = makeFiltered(origError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any).warn = makeFiltered(origWarn);
    } catch {
      // Ignore setup errors
    }
  }, []);

  // Get navigable files (ALL files in same folder, not filtered by type)
  const navigableFiles = allFiles.filter(f => 
    f.type === 'file' && 
    f.parentFolderId === currentFolderId
  );

  const currentIndex = navigableFiles.findIndex(f => f.id === fileId);
  const canNavigatePrev = currentIndex > 0;
  const canNavigateNext = currentIndex < navigableFiles.length - 1;

  const handlePrevFile = () => {
    if (navigableFiles.length <= 1) return;
    
    const prevIndex = currentIndex - 1;
    const targetIndex = prevIndex < 0 ? navigableFiles.length - 1 : prevIndex;
    const prevFile = navigableFiles[targetIndex];
    onNavigate(prevFile.id);
  };

  const handleNextFile = () => {
    if (navigableFiles.length <= 1) return;
    
    const nextIndex = currentIndex + 1;
    const targetIndex = nextIndex >= navigableFiles.length ? 0 : nextIndex;
    const nextFile = navigableFiles[targetIndex];
    onNavigate(nextFile.id);
  };

  const handleToggleFavoriteInternal = () => {
    setIsFavorite(!isFavorite);
    onToggleFavorite(fileId);
  };

  const handleDeleteFile = () => {
    onDelete(fileId);
    
    if (navigableFiles.length > 1) {
      if (canNavigateNext) {
        const nextFile = navigableFiles[currentIndex + 1];
        onNavigate(nextFile.id);
      } else if (canNavigatePrev) {
        const prevFile = navigableFiles[currentIndex - 1];
        onNavigate(prevFile.id);
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const handleRename = (newName: string) => {
    if (onRename) {
      onRename(fileId, newName);
      } else {
      }
    setShowRenameModal(false);
  };

  // Drag scrolling handlers - NOW WORKS FOR BOTH PDF AND DOCX
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDocumentViewer && toolMode === 'hand' && scrollContainerRef.current) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX + scrollContainerRef.current.scrollLeft,
        y: e.clientY + scrollContainerRef.current.scrollTop
      });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scrollContainerRef.current && toolMode === 'hand') {
      const newScrollLeft = dragStart.x - e.clientX;
      const newScrollTop = dragStart.y - e.clientY;
      scrollContainerRef.current.scrollLeft = newScrollLeft;
      scrollContainerRef.current.scrollTop = newScrollTop;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        
      });
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle mouse movement to show/hide bars in fullscreen
  useEffect(() => {
    if (!isFullscreen) {
      setShowBars(true);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        setHideTimeout(null);
      }
      return;
    }

    const handleMouseMove = () => {
      setShowBars(true);
      
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      
      const timeout = setTimeout(() => {
        setShowBars(false);
      }, 2000);
      
      setHideTimeout(timeout);
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    // Initial timeout
    const timeout = setTimeout(() => {
      setShowBars(false);
    }, 2000);
    setHideTimeout(timeout);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [isFullscreen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && navigableFiles.length > 1) {
        handlePrevFile();
      } else if (e.key === 'ArrowRight' && navigableFiles.length > 1) {
        handleNextFile();
      } else if (e.key === 'Escape' && !document.fullscreenElement) {
        onClose();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, navigableFiles]);

  // Add annotation layer CSS dynamically
  useEffect(() => {
    // Check if the styles are already added
    if (typeof window !== 'undefined' && !document.getElementById('react-pdf-annotation-layer')) {
      const style = document.createElement('style');
      style.id = 'react-pdf-annotation-layer';
      style.textContent = `
        .react-pdf__Page__annotations {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .react-pdf__Page__annotations .annotationLayer {
          position: absolute;
          top: 0;
          left: 0;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Load text files and DOCX files
  useEffect(() => {
    if (category === 'text') {
      setLoading(true);
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setLoading(false);
        })
        .catch(err => {
          setError('Failed to load text file: ' + err.message);
          setLoading(false);
        });
    } else if (category === 'docx' || category === 'pptx' || category === 'xlsx') {
      setLoading(true);
      
      // Load mammoth from CDN
      const loadMammoth = async () => {
        // Check if mammoth is already loaded
        if (typeof (window as any).mammoth !== 'undefined') {
          return (window as any).mammoth;
        }
        
        // Load mammoth script from CDN
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
          script.onload = () => {
            if ((window as any).mammoth) {
              resolve((window as any).mammoth);
            } else {
              reject(new Error('Mammoth failed to load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load mammoth script'));
          document.head.appendChild(script);
        });
      };

      // Load JSZip from CDN (for PPTX)
      const loadJSZip = async () => {
        if (typeof (window as any).JSZip !== 'undefined') {
          return (window as any).JSZip;
        }
        
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
          script.onload = () => {
            if ((window as any).JSZip) {
              resolve((window as any).JSZip);
            } else {
              reject(new Error('JSZip failed to load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load JSZip script'));
          document.head.appendChild(script);
        });
      };

      // Load XLSX from CDN (for Excel files)
      const loadXLSX = async () => {
        if (typeof (window as any).XLSX !== 'undefined') {
          return (window as any).XLSX;
        }
        
        return new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
          script.onload = () => {
            if ((window as any).XLSX) {
              resolve((window as any).XLSX);
            } else {
              reject(new Error('XLSX failed to load'));
            }
          };
          script.onerror = () => reject(new Error('Failed to load XLSX script'));
          document.head.appendChild(script);
        });
      };

      if (category === 'docx') {
        // DOCX processing
        loadMammoth()
          .then((mammoth: any) => {
            return fetch(fileUrl)
              .then(res => res.arrayBuffer())
              .then(arrayBuffer => {
                return mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
              });
          })
          .then((result: any) => {
            const htmlContent = result.value;
            setDocxHtml(htmlContent);
            
            // Split content into pages based on structure
            const pages = splitDocxIntoPages(htmlContent);
            setDocxPages(pages);
            setNumPages(pages.length);
            setPageNumber(1);
            setLoading(false);
            
            if (result.messages && result.messages.length > 0) {
              }
          })
          .catch((err: Error) => {
            
            setError('Failed to load DOCX file: ' + err.message);
            setLoading(false);
          });
      } else if (category === 'pptx') {
        // PPTX processing
        loadJSZip()
          .then((JSZip: any) => {
            return fetch(fileUrl)
              .then(res => res.arrayBuffer())
              .then(arrayBuffer => JSZip.loadAsync(arrayBuffer));
          })
          .then((zip: any) => {
            // Extract slides from PPTX
            const slideFiles = Object.keys(zip.files)
              .filter((name: string) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
              .sort((a: string, b: string) => {
                const aNum = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
                const bNum = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
                return aNum - bNum;
              });
            
            const slidePromises = slideFiles.map((slideFile: string) => 
              zip.file(slideFile)?.async('text')
            );
            
            return Promise.all(slidePromises);
          })
          .then((slideContents: string[]) => {
            const pages: string[] = [];
            
            slideContents.forEach((content, index) => {
              if (content) {
                // Extract text from XML
                const textMatches = content.match(/<a:t>([^<]+)<\/a:t>/g) || [];
                const slideTexts = textMatches.map(match => 
                  match.replace(/<\/?a:t>/g, '').trim()
                ).filter(Boolean);
                
                // Create slide HTML
                const slideHtml = `
                  <div class="pptx-slide">
                    <h2 class="text-2xl font-bold mb-4">Slide ${index + 1}</h2>
                    ${slideTexts.map(text => `<p class="mb-2">${text}</p>`).join('')}
                  </div>
                `;
                
                pages.push(slideHtml || `<div class="pptx-slide"><p>Slide ${index + 1}</p></div>`);
              }
            });
            
            if (pages.length === 0) {
              pages.push('<div class="pptx-slide"><p>No content found in presentation</p></div>');
            }
            
            setDocxPages(pages);
            setNumPages(pages.length);
            setPageNumber(1);
            setLoading(false);
          })
          .catch((err: Error) => {
            
            setError('Failed to load PPTX file: ' + err.message);
            setLoading(false);
          });
      } else if (category === 'xlsx') {
        // XLSX processing
        loadXLSX()
          .then((XLSX: any) => {
            return fetch(fileUrl)
              .then(res => res.arrayBuffer())
              .then(arrayBuffer => {
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const pages: string[] = [];
                
                workbook.SheetNames.forEach((sheetName: string) => {
                  const worksheet = workbook.Sheets[sheetName];
                  const html = XLSX.utils.sheet_to_html(worksheet, {
                    header: '',
                    footer: ''
                  });
                  
                  const pageHtml = `
                    <div class="xlsx-sheet">
                      <h2 class="text-xl font-bold mb-4 text-gray-800">${sheetName}</h2>
                      <div class="xlsx-table-container">
                        ${html}
                      </div>
                    </div>
                  `;
                  
                  pages.push(pageHtml);
                });
                
                if (pages.length === 0) {
                  pages.push('<div class="xlsx-sheet"><p>No sheets found in workbook</p></div>');
                }
                
                setDocxPages(pages);
                setNumPages(pages.length);
                setPageNumber(1);
                setLoading(false);
              });
          })
          .catch((err: Error) => {
            
            setError('Failed to load XLSX file: ' + err.message);
            setLoading(false);
          });
      }
    } else if (category === 'pdf') {
      // For PDFs, let the Document component handle loading
      setLoading(false);
      setError(null);
      setNumPages(0);
      setPageNumber(1);
    } else {
      // For all other types
      setLoading(false);
    }
  }, [fileUrl, category]);

  // SEARCH with DARK YELLOW HIGHLIGHTING - NOW WORKS FOR BOTH PDF AND DOCX
  useEffect(() => {
    if (!isDocumentViewer || numPages === 0 || !searchQuery.trim()) {
      // Clear all highlights
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
      });
      setSearchMatches([]);
      setCurrentMatchIndex(0);
      return;
    }

    setTimeout(() => {
      // Clear old highlights
      document.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight');
      });

      const matches: Array<{pageNum: number, matchIndex: number}> = [];
      let globalMatchIndex = 0;

      if (category === 'pdf') {
        // PDF search (existing code)
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const textLayer = document.querySelector(`[data-page-number="${pageNum}"] .react-pdf__Page__textContent`);
          if (!textLayer) continue;

          const textSpans = textLayer.querySelectorAll('span');
          const searchLower = searchQuery.toLowerCase().trim();

          textSpans.forEach((span: Element) => {
            const text = span.textContent || '';
            const textLower = text.toLowerCase();
            
            if (textLower.includes(searchLower)) {
              matches.push({pageNum, matchIndex: globalMatchIndex++});
              span.classList.add('search-highlight');
              }
          });
        }
      } else if (category === 'docx' || category === 'pptx' || category === 'xlsx') {
        // Office document search - search within the HTML content
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageEl = document.querySelector(`[data-page-number="${pageNum}"] .docx-content`);
          if (!pageEl) continue;

          const searchLower = searchQuery.toLowerCase().trim();
          const walker = document.createTreeWalker(
            pageEl,
            NodeFilter.SHOW_TEXT,
            null
          );

          let node;
          while (node = walker.nextNode()) {
            const text = node.textContent || '';
            const textLower = text.toLowerCase();
            
            if (textLower.includes(searchLower)) {
              // Wrap the matching text in a span with highlight class
              const parent = node.parentElement;
              if (parent && !parent.classList.contains('search-highlight')) {
                const span = document.createElement('span');
                span.className = 'search-highlight';
                span.textContent = text;
                parent.replaceChild(span, node);
                
                matches.push({pageNum, matchIndex: globalMatchIndex++});
                }
            }
          }
        }
      }

      setSearchMatches(matches);
      setCurrentMatchIndex(0);

      // Jump to first match
      if (matches.length > 0) {
        const firstMatch = matches[0];
        setPageNumber(firstMatch.pageNum);
        jumpToPage(firstMatch.pageNum);
      } else {
        }
    }, 300);

  }, [searchQuery, category, numPages, isDocumentViewer]);

  // ACTUAL FIX: Get absolute position and scroll TO it - NOW WORKS FOR BOTH PDF AND DOCX
  const jumpToPage = (pageNum: number) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    setIsManuallyScrolling(true);
    
    setTimeout(() => {
      const pageEl = document.querySelector(`[data-page-number="${pageNum}"]`) as HTMLElement;
      
      if (!pageEl) {
        setIsManuallyScrolling(false);
        return;
      }
      
      // Get the absolute position of the page relative to the container's scroll area
      const scrollPosition = pageEl.offsetTop - 24; // Subtract the py-6 (24px) padding
      
      // Scroll TO this absolute position with AUTO (instant) not smooth
      container.scrollTo({
        top: scrollPosition,
        behavior: 'auto'
      });
      
      setTimeout(() => setIsManuallyScrolling(false), 100);
    }, 50);
  };

  // Next match navigation
  const handleNextSearchMatch = () => {
    if (searchMatches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    
    setCurrentMatchIndex(nextIndex);
    
    const match = searchMatches[nextIndex];
    setPageNumber(match.pageNum);
    jumpToPage(match.pageNum);
  };

  // Previous match navigation
  const handlePrevSearchMatch = () => {
    if (searchMatches.length === 0) return;
    const prevIndex = currentMatchIndex - 1 < 0 ? searchMatches.length - 1 : currentMatchIndex - 1;
    
    setCurrentMatchIndex(prevIndex);
    
    const match = searchMatches[prevIndex];
    setPageNumber(match.pageNum);
    jumpToPage(match.pageNum);
  };

  // Track scroll position to update current page number using Intersection Observer (PDF and DOCX)
  useEffect(() => {
    if (!isDocumentViewer || !scrollContainerRef.current || numPages === 0) return;

    const container = scrollContainerRef.current;
    
    // Use Intersection Observer - this automatically handles viewport changes
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        // Skip if user is manually scrolling
        if (isManuallyScrolling) return;
        
        // Find the page with the MOST visibility that's above 50%
        let bestPage = null;
        let maxVisibility = 0.5; // Minimum 50% threshold

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxVisibility) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '1');
            maxVisibility = entry.intersectionRatio;
            bestPage = pageNum;
          }
        });

        // Only update if we found a page meeting the threshold
        if (bestPage !== null) {
          setPageNumber(bestPage);
        }
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1.0], // Check at key visibility levels
        rootMargin: '0px'
      }
    );

    // Wait for pages to render, then observe them
    setTimeout(() => {
      for (let i = 1; i <= numPages; i++) {
        const pageEl = document.querySelector(`[data-page-number="${i}"]`);
        if (pageEl) {
          observer.observe(pageEl);
        }
      }
    }, 200);

    return () => {
      observer.disconnect();
    };
  }, [isDocumentViewer, numPages, isManuallyScrolling]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number}) {
    setNumPages(numPages);
    setLoading(false);
    setPageNumber(1); // Reset to page 1
    // Scroll to top of PDF
    setTimeout(() => {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      
      // Capture thumbnails after pages render
      setTimeout(() => {
        const thumbnails = new Map<number, string>();
        for (let i = 1; i <= numPages; i++) {
          const canvas = document.querySelector(`[data-page-number="${i}"] canvas`) as HTMLCanvasElement;
          if (canvas) {
            try {
              thumbnails.set(i, canvas.toDataURL('image/jpeg', 0.3));
            } catch (err) {
              }
          }
        }
        setPageThumbnails(thumbnails);
        }, 1000);
    }, 100);
  }

  function onDocumentLoadError(error: Error) {
    
    setError('Failed to load PDF document. ' + error.message);
    setLoading(false);
  }

  const handleZoomIn = () => {
    if (category === 'pdf') {
      setPdfScale(prev => Math.min(4.5, prev + 0.375)); // Increment by 25% displayed (0.375 actual)
    } else if (category === 'docx') {
      setZoom(prev => Math.min(300, prev + 25));
    } else {
      setZoom(prev => Math.min(300, prev + 25));
    }
  };

  const handleZoomOut = () => {
    if (category === 'pdf') {
      setPdfScale(prev => Math.max(0.75, prev - 0.375)); // Decrement by 25% displayed (0.375 actual)
    } else if (category === 'docx') {
      setZoom(prev => Math.max(25, prev - 25));
    } else {
      setZoom(prev => Math.max(25, prev - 25));
    }
  };

  const zoomOptions = [
    { label: 'Automatic Zoom', value: 100 },
    { label: 'Actual Size', value: 100 },
    { label: 'Page Fit', value: 75 },
    { label: 'Page Width', value: 125 },
    { label: '50%', value: 50 },
    { label: '75%', value: 75 },
    { label: '100%', value: 100 },
    { label: '125%', value: 125 },
    { label: '150%', value: 150 },
    { label: '200%', value: 200 },
    { label: '300%', value: 300 },
    { label: '400%', value: 400 },
  ];

  const getFileIcon = () => {
    switch (category) {
      case 'pdf': return '/encodex-file.svg';
      case 'docx': return '/encodex-file.svg';
      case 'xlsx': return '/encodex-spreadsheet.svg';
      case 'pptx': return '/encodex-file.svg';
      case 'image': return '/encodex-image.svg';
      case 'video': return '/encodex-video.svg';
      case 'audio': return '/encodex-audio.svg';
      case 'text': return '/encodex-file.svg';
      default: return '/encodex-paperclip.svg';
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="text-white text-center">
          <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 max-w-md text-center">
          <div className="flex justify-center mb-4">
            <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-400 font-semibold mb-2">Error</p>
          <p className="text-gray-300 text-sm">{error}</p>
          <div className="mt-4">
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                setReloadKey((k) => k + 1);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    switch (category) {
      case 'pdf':
        return (
          <div className="w-full">
            <style
              id="react-pdf-critical-styles"
              dangerouslySetInnerHTML={{ __html: `
                .react-pdf__Page__annotations, .react-pdf__AnnotationLayer, .react-pdf__Page__annotationLayer {
                  position: absolute; left:0; top:0; height:100%; width:100%; pointer-events:auto;
                }
                .react-pdf__Page__textContent, .react-pdf__TextLayer, .react-pdf__Page__textLayer {
                  position:absolute; left:0; top:0; right:0; bottom:0; color: transparent; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
                }
                .react-pdf__Page__textContent > span, .react-pdf__TextLayer span { display:inline-block; transform-origin:0 0; white-space:pre; pointer-events:none; }
                .react-pdf__Page canvas { display:block; max-width:100%; }
              ` }}
            />
            <Document
              key={reloadKey}
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={
                <div className="text-white text-center py-20">
                  <div className="animate-spin w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p>Loading PDF...</p>
                </div>
              }
              error={
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 max-w-md text-center mx-auto">
                  <div className="flex justify-center mb-4">
                    <svg className="w-10 h-10 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-red-400 font-semibold mb-2">Failed to load PDF</p>
                  <p className="text-gray-300 text-sm mb-4">Try refreshing the page.</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                  >
                    Reload
                  </button>
                </div>
              }
            >
              {/* Render ALL pages stacked vertically */}
              {numPages > 0 && Array.from(new Array(numPages), (_, index) => (
                <div 
                  key={`page_${index + 1}`} 
                  data-page-number={index + 1}
                  className="mb-4 flex justify-center"
                >
                  <div className="shadow-2xl bg-white">
                    <Page
                      pageNumber={index + 1}
                      scale={pdfScale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      rotate={rotation}
                      onRenderError={(err) => {
                        
                        setError('Failed to render PDF page. ' + (err?.message || ''));
                      }}
                    />
                  </div>
                </div>
              ))}
            </Document>
          </div>
        );

      case 'docx':
      case 'pptx':
      case 'xlsx':
        return (
          <div className="w-full">
            {/* Render ALL document pages stacked vertically like PDF */}
            {docxPages.length > 0 && docxPages.map((pageHtml, index) => (
              <div 
                key={`${category}_page_${index + 1}`} 
                data-page-number={index + 1}
                className="mb-4 flex justify-center"
              >
                <div 
                  className="bg-white shadow-2xl docx-page"
                  style={{ 
                    transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                    transformOrigin: 'top center',
                    width: category === 'pptx' ? '1200px' : category === 'xlsx' ? '1400px' : '816px',
                    minHeight: category === 'pptx' ? '675px' : category === 'xlsx' ? '900px' : '1056px',
                    padding: category === 'pptx' ? '60px' : category === 'xlsx' ? '40px' : '96px 72px',
                    boxSizing: 'border-box',
                    aspectRatio: category === 'pptx' ? '16/9' : undefined
                  }}
                >
                  <div 
                    className="docx-content"
                    dangerouslySetInnerHTML={{ __html: pageHtml }}
                  />
                </div>
              </div>
            ))}
          </div>
        );

      case 'image':
        return (
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain"
            style={{ transform: `scale(${zoom / 100})` }}
          />
        );

      case 'video':
        return (
          <video
            src={fileUrl}
            controls
            className="max-w-full max-h-full"
            autoPlay
          >
            Your browser does not support the video tag.
          </video>
        );

      case 'audio':
        return (
          <div className="bg-gray-800/90 backdrop-blur-sm rounded-xl p-8 max-w-md w-full">
            <div className="text-6xl mb-6 text-center">{getFileIcon()}</div>
            <p className="text-white text-xl font-semibold text-center mb-6">{fileName}</p>
            <audio
              src={fileUrl}
              controls
              className="w-full"
              autoPlay
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        );

      case 'text':
        return (
          <div className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-auto">
            <pre className="text-gray-300 text-sm whitespace-pre-wrap font-mono">
              {textContent}
            </pre>
          </div>
        );

      default:
        return (
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-xl p-10 max-w-md text-center border border-slate-700/50">
            <div className="text-8xl mb-6">{getFileIcon()}</div>
            <p className="text-white text-xl mb-2 font-semibold">{fileName}</p>
            <p className="text-gray-400 text-sm mb-8">
              This file type cannot be previewed. Please download to view.
            </p>
            <a
              href={fileUrl}
              download={fileName}
              className="inline-block px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-semibold"
            >
              Download File
            </a>
          </div>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Navigation Arrows - Fixed positioning outside scroll container, away from scrollbar */}
        {navigableFiles.length > 1 && (
          <div className="fixed inset-0 pointer-events-none z-30 flex items-center justify-between px-8">
            {/* Previous Button - Left side */}
            <button
              onClick={handlePrevFile}
              className="p-3 rounded-full transition-all bg-gray-800/90 hover:bg-gray-700 text-white shadow-xl pointer-events-auto"
              title="Previous file (←)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Next Button - Right side, matching left spacing */}
            <button
              onClick={handleNextFile}
              className="p-3 rounded-full transition-all bg-gray-800/90 hover:bg-gray-700 text-white shadow-xl pointer-events-auto"
              title="Next file (→)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}

        {/* Header */}
        <div 
          className={`bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between relative transition-all duration-300 ${
            isFullscreen ? (showBars ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none') : ''
          }`}
        >
          {/* Left side - Action buttons */}
          <div className="flex items-center gap-2">
            {/* Download */}
            <a
              href={fileUrl}
              download={fileName}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
              title="Download"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>

            {/* Rename - Always show */}
            <button
              onClick={() => setShowRenameModal(true)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
              title="Rename"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>

            {/* Favorite - Heart Icon */}
            <button
              onClick={handleToggleFavoriteInternal}
              className={`p-2 hover:bg-gray-700 rounded-lg transition-colors ${
                isFavorite ? 'text-red-400' : 'text-gray-300 hover:text-white'
              }`}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg className="w-5 h-5" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>

            {/* Trash / Delete */}
            <button
              onClick={handleDeleteFile}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-red-400"
              title="Move to trash"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          {/* Center - Filename in header bar */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center max-w-2xl">
            <h2 
              className="text-base font-medium text-white text-center break-words px-2" 
              title={fileName}
            >
              {fileName}
            </h2>
            {navigableFiles.length > 1 && (
              <span className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                File {currentIndex + 1} of {navigableFiles.length}
              </span>
            )}
          </div>
          
          {/* Right side - Close button */}
          <div className="flex items-center">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
              title="Close (Esc)"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Document Toolbar - Show for PDFs and DOCX */}
        {isDocumentViewer && (
          <div className="bg-gray-700 border-b border-gray-600 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Toggle Sidebar - PDF and DOCX */}
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white"
                title="Toggle Sidebar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Search Bar - PDF AND DOCX */}
              {isDocumentViewer && (
                !showSearch ? (
                  <button
                    onClick={() => {
                      setShowSearch(true);
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }}
                    className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white"
                    title="Find in Document (Ctrl+F)"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-gray-600 rounded-lg px-3 py-1.5">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleNextSearchMatch();
                        }
                        if (e.key === 'Escape') {
                          setShowSearch(false);
                          setSearchQuery('');
                        }
                      }}
                      placeholder="Find in document..."
                      className="bg-transparent border-none outline-none text-white text-sm w-48 placeholder-gray-400"
                    />
                    {searchMatches.length > 0 && (
                      <span className="text-xs text-gray-300 whitespace-nowrap">
                        {currentMatchIndex + 1} of {searchMatches.length}
                      </span>
                    )}
                    {searchQuery && searchMatches.length === 0 && (
                      <span className="text-xs text-gray-400">No matches</span>
                    )}
                    <button 
                      onClick={handlePrevSearchMatch} 
                      className="p-1 hover:bg-gray-500 rounded disabled:opacity-40" 
                      disabled={searchMatches.length === 0}
                      title="Previous match"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button 
                      onClick={handleNextSearchMatch} 
                      className="p-1 hover:bg-gray-500 rounded disabled:opacity-40" 
                      disabled={searchMatches.length === 0}
                      title="Next match (Enter)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => { setShowSearch(false); setSearchQuery(''); }} 
                      className="p-1 hover:bg-gray-500 rounded"
                      title="Close search (Esc)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )
              )}

              {/* Previous Page - PDF and DOCX */}
              {isDocumentViewer && numPages > 0 && (
                <>
                  <button
                    onClick={() => {
                      const newPage = Math.max(1, pageNumber - 1);
                      setPageNumber(newPage);
                      jumpToPage(newPage);
                    }}
                    disabled={pageNumber <= 1}
                    className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white disabled:opacity-40"
                    title="Previous Page"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Next Page */}
                  <button
                    onClick={() => {
                      const newPage = Math.min(numPages, pageNumber + 1);
                      setPageNumber(newPage);
                      jumpToPage(newPage);
                    }}
                    disabled={pageNumber >= numPages}
                    className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white disabled:opacity-40"
                    title="Next Page"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Page Number */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pageNumber}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '');
                        if (val === '') return;
                        const num = parseInt(val);
                        if (num >= 1 && num <= numPages) {
                          setPageNumber(num);
                          jumpToPage(num);
                        }
                      }}
                      className="w-16 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-center text-sm focus:outline-none focus:border-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-gray-300 text-sm">of {numPages}</span>
                  </div>
                </>
              )}
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-2">
              {/* Zoom Out */}
              <button
                onClick={handleZoomOut}
                disabled={category === 'pdf' ? pdfScale <= 0.75 : zoom <= 25}
                className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white disabled:opacity-40"
                title="Zoom Out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>

              {/* Zoom In */}
              <button
                onClick={handleZoomIn}
                disabled={category === 'pdf' ? pdfScale >= 4.5 : zoom >= 300}
                className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white disabled:opacity-40"
                title="Zoom In"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>

              {/* Zoom Dropdown */}
              <div className="relative" ref={zoomMenuRef}>
                <button
                  onClick={() => setShowZoomMenu(!showZoomMenu)}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm min-w-[100px] flex items-center justify-between"
                >
                  <span>{category === 'pdf' ? Math.round((pdfScale / 1.5) * 100) : zoom}%</span>
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showZoomMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-xl overflow-hidden min-w-[150px] max-h-80 overflow-y-auto z-50">
                    {category === 'pdf' ? (
                      [0.75, 1.125, 1.5, 1.875, 2.25, 3.0, 3.75, 4.5].map((scale) => (
                        <button
                          key={scale}
                          onClick={() => {
                            setPdfScale(scale);
                            setShowZoomMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm ${
                            Math.abs(pdfScale - scale) < 0.01
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {Math.round((scale / 1.5) * 100)}%
                        </button>
                      ))
                    ) : (
                      [25, 50, 75, 100, 125, 150, 200, 300].map((zoomLevel) => (
                        <button
                          key={zoomLevel}
                          onClick={() => {
                            setZoom(zoomLevel);
                            setShowZoomMenu(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm ${
                            zoom === zoomLevel
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          {zoomLevel}%
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Menu Button (⋮) - NOW WORKS FOR BOTH PDF AND DOCX */}
              {isDocumentViewer && (
                <div className="relative" ref={pdfMenuRef}>
                  <button
                    onClick={() => setShowPdfMenu(!showPdfMenu)}
                    className="p-2 hover:bg-gray-600 rounded transition-colors text-gray-300 hover:text-white"
                    title="More options"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {showPdfMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPdfMenu(false)} />
                      <div className="absolute right-0 top-full mt-2 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden min-w-[220px]">
                        <button
                          onClick={() => { 
                            setPageNumber(1);
                            jumpToPage(1);
                            setShowPdfMenu(false); 
                          }}
                          disabled={pageNumber === 1}
                          className={`w-full text-left px-4 py-2.5 transition-colors text-sm flex items-center gap-3 ${
                            pageNumber === 1 
                              ? 'text-gray-500 cursor-not-allowed opacity-50' 
                              : 'text-white hover:bg-gray-700'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                          Go to First Page
                        </button>

                        <button
                          onClick={() => { 
                            setPageNumber(numPages);
                            jumpToPage(numPages);
                            setShowPdfMenu(false); 
                          }}
                          disabled={pageNumber === numPages}
                          className={`w-full text-left px-4 py-2.5 transition-colors text-sm flex items-center gap-3 border-t border-gray-700 ${
                            pageNumber === numPages 
                              ? 'text-gray-500 cursor-not-allowed opacity-50' 
                              : 'text-white hover:bg-gray-700'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          Go to Last Page
                        </button>

                        {/* Rotation for BOTH PDF and DOCX */}
                        <button
                          onClick={() => { setRotation((prev) => (prev + 90) % 360); setShowPdfMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-white hover:bg-gray-700 transition-colors text-sm flex items-center gap-3 border-t border-gray-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Rotate Clockwise
                        </button>

                        <button
                          onClick={() => { setRotation((prev) => (prev - 90 + 360) % 360); setShowPdfMenu(false); }}
                          className="w-full text-left px-4 py-2.5 text-white hover:bg-gray-700 transition-colors text-sm flex items-center gap-3 border-t border-gray-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Rotate Counterclockwise
                        </button>

                        <div className="border-t border-gray-700 py-2">
                          <button
                            onClick={() => { setToolMode('text'); setShowPdfMenu(false); }}
                            className={`w-full text-left px-4 py-2.5 transition-colors text-sm flex items-center gap-3 ${
                              toolMode === 'text' ? 'bg-blue-600/20 text-blue-400' : 'text-white hover:bg-gray-700'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                            </svg>
                            Text Selection Tool
                          </button>

                          <button
                            onClick={() => { setToolMode('hand'); setShowPdfMenu(false); }}
                            className={`w-full text-left px-4 py-2.5 transition-colors text-sm flex items-center gap-3 ${
                              toolMode === 'hand' ? 'bg-blue-600/20 text-blue-400' : 'text-white hover:bg-gray-700'
                            }`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                            </svg>
                            Hand Tool
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PDF/DOCX Sidebar - Shows thumbnails for BOTH */}
        {isDocumentViewer && showSidebar && numPages > 0 && (
          <div className="absolute left-0 top-[120px] bottom-0 w-48 bg-gray-800/95 border-r border-gray-700 overflow-y-auto z-[100]">
            <div className="p-2">
              <h3 className="text-xs font-semibold text-gray-300 mb-2 uppercase px-2">Pages</h3>
              <div className="space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((page) => {
                  if (category === 'pdf') {
                    // PDF uses captured canvas thumbnails
                    const thumbnail = pageThumbnails.get(page);
                    return (
                      <button
                        key={page}
                        onClick={() => {
                          setPageNumber(page);
                          jumpToPage(page);
                        }}
                        className={`w-full rounded overflow-hidden transition-all ${
                          pageNumber === page
                            ? 'ring-2 ring-blue-500'
                            : 'hover:ring-2 hover:ring-gray-600'
                        }`}
                      >
                        <div className="bg-gray-900 p-1">
                          {thumbnail ? (
                            <img 
                              src={thumbnail}
                              alt={`Page ${page}`}
                              className="w-full object-contain bg-white"
                            />
                          ) : (
                            <div className="w-full aspect-[8.5/11] bg-gray-700 flex items-center justify-center">
                              <span className="text-gray-400 text-xs">Page {page}</span>
                            </div>
                          )}
                          <span className="text-xs text-gray-400 mt-1 block text-center">{page}</span>
                        </div>
                      </button>
                    );
                  } else {
                    // DOCX/PPTX/XLSX use CSS-scaled live preview - INSTANT!
                    return (
                      <button
                        key={page}
                        onClick={() => {
                          setPageNumber(page);
                          jumpToPage(page);
                        }}
                        className={`w-full rounded overflow-hidden transition-all ${
                          pageNumber === page
                            ? 'ring-2 ring-blue-500'
                            : 'hover:ring-2 hover:ring-gray-600'
                        }`}
                      >
                        <div className="bg-gray-900 p-1">
                          <div className="w-full aspect-[8.5/11] bg-white overflow-hidden relative">
                            {/* Live CSS-scaled preview - NO capture needed! */}
                            <div 
                              className="absolute top-0 left-0 origin-top-left pointer-events-none docx-thumbnail-preview"
                              style={{
                                transform: 'scale(0.17)',
                                width: '816px',
                                height: '1056px'
                              }}
                            >
                              <div 
                                className="bg-white docx-page"
                                style={{ 
                                  width: '816px',
                                  minHeight: '1056px',
                                  padding: '96px 72px',
                                  boxSizing: 'border-box'
                                }}
                              >
                                <div 
                                  className="docx-content"
                                  dangerouslySetInnerHTML={{ __html: docxPages[page - 1] || '' }}
                                />
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-gray-400 mt-1 block text-center">{page}</span>
                        </div>
                      </button>
                    );
                  }
                })}
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-gray-900 py-6 px-4 relative"
          style={{
            userSelect: isDocumentViewer && toolMode === 'text' ? 'text' : 'none',
            cursor: isDragging ? 'grabbing' : 
                    isDocumentViewer && toolMode === 'hand' ? 'grab' : 
                    isDocumentViewer && toolMode === 'text' ? 'text' : 'default'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* File Content */}
          <div className={category === 'pdf' ? 'w-full' : 'flex items-center justify-center min-h-full'}>
            {renderContent()}
          </div>
        </div>

        {/* Bottom Toolbar - Zoom controls (ONLY for images, NOT PDFs or DOCX) */}
        {category === 'image' && !loading && !error && (
          <div 
            className={`bg-gray-800 border-t border-gray-700 px-4 py-3 flex items-center justify-between transition-all duration-300 ${
              isFullscreen ? (showBars ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full pointer-events-none') : ''
            }`}
          >
            {/* Left side - Zoom controls centered */}
            <div className="flex items-center gap-4 flex-1 justify-center">
              {/* Zoom Out */}
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 25}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Zoom out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>

              {/* Zoom percentage - centered */}
              <span className="text-white text-sm font-medium min-w-[3.5rem] text-center">{zoom}%</span>

              {/* Zoom slider */}
              <input
                type="range"
                min="25"
                max="300"
                step="25"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-32 accent-orange-500"
              />

              {/* Zoom In */}
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 300}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                title="Zoom in"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
            </div>

            {/* Right side - Fullscreen button */}
            <div className="flex items-center">
              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
                title={isFullscreen ? "Exit fullscreen (F)" : "Enter fullscreen (F)"}
              >
                {isFullscreen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9H4v5M20 9h-5v5" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {showRenameModal && (
        <RenameModal
          isOpen={showRenameModal}
          onClose={() => setShowRenameModal(false)}
          currentName={fileName}
          onRename={handleRename}
          itemType="file"
        />
      )}

      {/* Custom CSS for clean PDF rendering, STRICT search highlighting, and DOCX styling */}
      <style jsx global>{`
        /* Clean PDF page rendering - no extra white space */
        .react-pdf__Page {
          display: inline-block;
          margin: 0;
          padding: 0;
        }
        
        .react-pdf__Page__canvas {
          display: block;
          max-width: 100%;
          height: auto !important;
          margin: 0;
          padding: 0;
        }

        /* Ensure no extra height on page wrapper */
        .react-pdf__Page > div {
          line-height: 0;
        }

        /* Text layer for selection and search */
        .react-pdf__Page__textContent {
          position: absolute;
          left: 0;
          top: 0;
          right: 0;
          bottom: 0;
          overflow: hidden;
          opacity: 0.2;
          line-height: 1;
          pointer-events: auto;
        }

        /* Enable text selection only in text mode */
        [style*="user-select: text"] .react-pdf__Page__textContent {
          user-select: text !important;
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
        }

        /* Disable text selection in hand mode */
        [style*="user-select: none"] .react-pdf__Page__textContent {
          user-select: none !important;
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          pointer-events: none;
        }

        .react-pdf__Page__textContent span {
          color: transparent !important;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
        }

        /* DARK YELLOW search highlighting - background only, text stays transparent */
        .react-pdf__Page__textContent span.search-highlight {
          background-color: rgba(184, 134, 11, 0.6) !important;
          color: transparent !important;
        }

        /* DOCX search highlighting - DARK YELLOW */
        .docx-content .search-highlight {
          background-color: rgba(184, 134, 11, 0.6) !important;
        }

        /* LIGHT BLUE text selection highlight - background only */
        .react-pdf__Page__textContent span::selection {
          background: rgba(59, 130, 246, 0.4) !important;
          color: inherit !important;
        }

        .react-pdf__Page__textContent ::selection {
          background: rgba(59, 130, 246, 0.4) !important;
          color: inherit !important;
        }

        /* Text selection for DOCX, PPTX, XLSX content */
        .docx-content ::selection,
        .pptx-slide ::selection,
        .xlsx-sheet ::selection {
          background: rgba(59, 130, 246, 0.4) !important;
          color: inherit !important;
        }

        /* Ensure all text selections are visible */
        ::selection {
          background: rgba(59, 130, 246, 0.4) !important;
          color: inherit !important;
        }

        ::-moz-selection {
          background: rgba(59, 130, 246, 0.4) !important;
          color: inherit !important;
        }

        /* Annotation layer */
        .react-pdf__Page__annotations {
          position: absolute;
          left: 0;
          top: 0;
        }

        /* DOCX Page Styling */
        .docx-page {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        /* DOCX Content Styling */
        .docx-content {
          font-family: 'Calibri', 'Arial', sans-serif;
          font-size: 11pt;
          line-height: 1.5;
          color: #000;
        }

        .docx-content h1, .docx-content h2, .docx-content h3,
        .docx-content h4, .docx-content h5, .docx-content h6 {
          font-weight: bold;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }

        .docx-content h1 { font-size: 2em; }
        .docx-content h2 { font-size: 1.5em; }
        .docx-content h3 { font-size: 1.17em; }

        .docx-content p {
          margin-bottom: 0.5em;
        }

        .docx-content ul, .docx-content ol {
          margin-left: 1.5em;
          margin-bottom: 0.5em;
        }

        .docx-content table {
          border-collapse: collapse;
          margin: 1em 0;
          width: 100%;
        }

        .docx-content table td, .docx-content table th {
          border: 1px solid #ccc;
          padding: 8px;
        }

        .docx-content img {
          max-width: 100%;
          height: auto;
        }

        .docx-content strong {
          font-weight: bold;
        }

        .docx-content em {
          font-style: italic;
        }

        /* PPTX Slide Styling */
        .pptx-slide {
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          padding: 2rem;
          min-height: 100%;
        }

        .pptx-slide h2 {
          color: #1e3a8a;
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 0.5rem;
        }

        .pptx-slide p {
          font-size: 1.1rem;
          line-height: 1.6;
          color: #1f2937;
        }

        /* XLSX Sheet Styling */
        .xlsx-sheet {
          padding: 1rem;
        }

        .xlsx-sheet h2 {
          color: #1e3a8a;
          border-bottom: 2px solid #3b82f6;
          padding-bottom: 0.5rem;
        }

        .xlsx-table-container {
          overflow-x: auto;
        }

        .xlsx-table-container table {
          border-collapse: collapse;
          width: 100%;
          font-size: 0.875rem;
        }

        .xlsx-table-container table td,
        .xlsx-table-container table th {
          border: 1px solid #d1d5db;
          padding: 0.5rem;
          text-align: left;
        }

        .xlsx-table-container table th {
          background-color: #f3f4f6;
          font-weight: 600;
          color: #1f2937;
        }

        .xlsx-table-container table tr:nth-child(even) {
          background-color: #f9fafb;
        }

        .xlsx-table-container table tr:hover {
          background-color: #eff6ff;
        }

        /* DOCX Thumbnail Preview Optimization - INSTANT RENDERING */
        .docx-thumbnail-preview {
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: flat;
        }

        .docx-thumbnail-preview .docx-content {
          font-size: 11pt !important;
          line-height: 1.5 !important;
        }

        /* Optimize thumbnail rendering - hide heavy elements */
        .docx-thumbnail-preview img {
          display: none; /* Hide images in thumbnails for speed */
        }

        /* PDF Thumbnail Preview Optimization - INSTANT RENDERING */
        .pdf-thumbnail-preview {
          will-change: transform;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          transform-style: flat;
        }

        .pdf-thumbnail-preview .react-pdf__Page {
          box-shadow: none !important;
        }

        .pdf-thumbnail-preview .react-pdf__Page__canvas {
          image-rendering: optimizeSpeed;
          image-rendering: -webkit-optimize-contrast;
        }

        /* Print styles */
        @media print {
          body * {
            visibility: hidden;
          }
          .react-pdf__Document,
          .react-pdf__Document *,
          .docx-content,
          .docx-content * {
            visibility: visible;
          }
          .react-pdf__Document,
          .docx-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .react-pdf__Page {
            max-width: 100% !important;
            page-break-after: always;
          }
          .react-pdf__Page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>
    </>
  );
}
