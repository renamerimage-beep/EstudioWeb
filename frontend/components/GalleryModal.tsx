/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { 
    ArrowDownTrayIcon, TrashIcon, PencilIcon, EllipsisVerticalIcon, 
    ListBulletIcon, Squares2X2Icon, FolderIcon, FolderPlusIcon, ChevronRightIcon, 
    CheckIcon, RestoreIcon, MagnifyingGlassIcon, XMarkIcon
} from './icons';
import { 
    getGalleryItems, deleteItems, renameItem, createFolder, moveItems, getPath, getAllFiles, restoreItems, findOrCreateTrashFolder,
    type GalleryItem, type GalleryFile, type StoredImage 
} from '../services/galleryService';
import PreviewModal from './PreviewModal';
import { type User } from 'firebase/auth';
import Spinner from './Spinner'; // Import Spinner

interface GalleryViewProps {
  onLoadImage: (image: StoredImage) => void;
  currentUser: User;
  currentView: AppView;
  getToken: () => Promise<string | null>;
}

type ViewMode = 'grid' | 'list';
type DateFilter = '' | 'today' | '7days' | '30days';

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const stripExtension = (filename: string) => filename.replace(/\.[^/.]+$/, "");

const GalleryView: React.FC<GalleryViewProps> = ({ onLoadImage, currentUser, currentView, getToken }) => {
    // Navigation and Item State
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [currentFolderId, setCurrentFolderId] = useState('root');
    const [path, setPath] = useState<{id: string, name: string}[]>([]);
    const [trashFolderId, setTrashFolderId] = useState<string | null>(null);
    
    // UI State
    const [isLoading, setIsLoading] = useState(false); // Loading state
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renamingValue, setRenamingValue] = useState('');
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const [previewState, setPreviewState] = useState<{isOpen: boolean, index: number}>({isOpen: false, index: 0});
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isDownloading, setIsDownloading] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);


    // Filtering State
    const [allFiles, setAllFiles] = useState<GalleryFile[]>([]);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [brandFilter, setBrandFilter] = useState<string>('');
    const [dateFilter, setDateFilter] = useState<DateFilter>('');
    const [searchQuery, setSearchQuery] = useState('');
    const isFiltering = !!brandFilter || !!dateFilter || !!searchQuery.trim();

    // Refs
    const menuRef = useRef<HTMLDivElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);
    const newFolderInputRef = useRef<HTMLInputElement>(null);
    
    const isTrashView = currentFolderId === trashFolderId;

    const refreshItemsInCurrentFolder = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication token not available.');
            const [currentItems, currentPath, trashFolder] = await Promise.all([
                getGalleryItems(currentFolderId, currentUser.uid, token),
                getPath(currentFolderId, token),
                findOrCreateTrashFolder(currentUser.uid, token)
            ]);
            setItems(currentItems);
            setPath(currentPath);
            setTrashFolderId(trashFolder.id);
        } catch (error) {
            console.error("Failed to refresh gallery items:", error);
        }
    }, [currentFolderId, currentUser.uid, getToken]);

    const loadAllFilesForFiltering = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication token not available.');
            const files = await getAllFiles(currentUser.uid, (currentUser as any).role === 'admin', token);
            setAllFiles(files);
            const brands = new Set<string>();
            files.forEach(file => {
                if (file.metadata?.['marca']) {
                    brands.add(file.metadata['marca']);
                }
            });
            setAvailableBrands(Array.from(brands).sort());
        } catch (error) {
            console.error("Failed to load all files for filtering:", error);
        }
    }, [currentUser.uid, (currentUser as any).role, getToken]);

    useEffect(() => {
        if (currentView === 'gallery' && currentUser) {
            const fetchData = async () => {
                setIsLoading(true);
                try {
                    await Promise.all([
                        refreshItemsInCurrentFolder(),
                        loadAllFilesForFiltering(),
                    ]);
                } catch (error) {
                    console.error("Failed to load gallery data:", error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchData();
        }
    }, [currentView, currentUser, refreshItemsInCurrentFolder, loadAllFilesForFiltering]);

    // Click outside handlers
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
            const target = event.target as HTMLElement;
            if (!target.closest('[data-item-id]') && !target.closest('[data-gallery-actions]') && !target.closest('[data-gallery-filters]')) {
                setSelectedItems(new Set());
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    useEffect(() => {
        if (renamingId && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [renamingId]);

    useEffect(() => {
        if (isCreatingFolder && newFolderInputRef.current) {
            newFolderInputRef.current.focus();
            newFolderInputRef.current.select();
        }
    }, [isCreatingFolder]);


    const displayedItems = useMemo(() => {
        if (!isFiltering) return items;
        
        const lowerCaseQuery = searchQuery.trim().toLowerCase();

        return allFiles.filter(file => {
            // Brand filter
            if (brandFilter && (file.metadata?.['marca'] || '').toLowerCase() !== brandFilter.toLowerCase()) {
                return false;
            }

            // Date filter
            if (dateFilter) {
                const now = new Date();
                const itemDate = new Date(file.timestamp);
                let filterDate = new Date();

                switch(dateFilter) {
                    case 'today':
                        if (itemDate.toDateString() !== now.toDateString()) return false;
                        break;
                    case '7days':
                        filterDate.setDate(now.getDate() - 7);
                        if (itemDate < filterDate) return false;
                        break;
                    case '30days':
                        filterDate.setDate(now.getDate() - 30);
                        if (itemDate < filterDate) return false;
                        break;
                }
            }
            
            // Search query filter
            if (lowerCaseQuery) {
                const nameMatch = file.name.toLowerCase().includes(lowerCaseQuery);
                if (nameMatch) return true;

                if (file.metadata) {
                    for (const key in file.metadata) {
                        const value = String(file.metadata[key] || '').toLowerCase();
                        if (value.includes(lowerCaseQuery)) {
                            return true;
                        }
                    }
                }
                return false; // No match found in name or metadata
            }

            return true; // Passed all active filters
        });
    }, [isFiltering, items, allFiles, brandFilter, dateFilter, searchQuery]);
    
    const metadataHeaders = useMemo(() => {
        const headers = new Set<string>();
        displayedItems.forEach(item => {
            if (item.type === 'file' && item.metadata) {
                Object.keys(item.metadata).forEach(key => {
                    if (key.toLowerCase() !== 'sku' && key.toLowerCase() !== 'marca') headers.add(key);
                });
            }
        });
        return Array.from(headers).sort();
    }, [displayedItems]);

    const openPreview = (clickedItem: GalleryFile) => {
        const imageFiles = displayedItems.filter(i => i.type === 'file') as GalleryFile[];
        const clickedIndex = imageFiles.findIndex(img => img.id === clickedItem.id);
        if (clickedIndex > -1) {
            setPreviewState({ isOpen: true, index: clickedIndex });
        }
    };

    // Action Handlers
    const handleInitiateCreateFolder = () => {
        if (isFiltering || isTrashView) return;
        setNewFolderName("Nova Pasta");
        setIsCreatingFolder(true);
    };

    const handleSaveNewFolder = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const folderName = newFolderName.trim();
        if (folderName) {
            try {
                const token = await getToken();
                if (!token) throw new Error("Token not available");
                await createFolder(folderName, currentFolderId, currentUser.uid, token);
                await refreshItemsInCurrentFolder();
            } catch (error) {
                console.error("Failed to create folder:", error);
            }
        }
        setIsCreatingFolder(false);
    };


    const handleRename = (id: string, currentName: string) => {
        if (isTrashView) return; // Disallow renaming in trash
        setRenamingId(id);
        const item = items.find(i => i.id === id) || allFiles.find(i => i.id === id);
        setRenamingValue(item?.type === 'file' ? stripExtension(currentName) : currentName);
        setActiveMenu(null);
    };

    const handleSaveRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (renamingId && renamingValue.trim()) {
            try {
                const token = await getToken();
                if (!token) throw new Error("Token not available");
                await renameItem(renamingId, renamingValue.trim(), token);
                await Promise.all([refreshItemsInCurrentFolder(), loadAllFilesForFiltering()]);
            } catch (error) {
                console.error("Failed to rename item:", error);
            }
        }
        setRenamingId(null);
        setRenamingValue('');
    };

    const handleInitiateDelete = () => {
        if (selectedItems.size === 0) return;
        setActiveMenu(null);
        setConfirmingDelete(true);
    };

    const handleConfirmDelete = async () => {
        if (selectedItems.size === 0) return;
        try {
            const token = await getToken();
            if (!token) throw new Error("Token not available");
            await deleteItems(Array.from(selectedItems), currentUser.uid, token);
            setSelectedItems(new Set());
            await Promise.all([refreshItemsInCurrentFolder(), loadAllFilesForFiltering()]);
        } catch (error) {
            console.error("Failed to delete items:", error);
        } finally {
            setConfirmingDelete(false);
        }
    };

    const handleCancelDelete = () => {
        setConfirmingDelete(false);
    };
    
    const handleRestoreSelection = async () => {
        if (selectedItems.size === 0) return;
        try {
            const token = await getToken();
            if (!token) throw new Error("Token not available");
            await restoreItems(Array.from(selectedItems), token);
            setSelectedItems(new Set());
            await Promise.all([refreshItemsInCurrentFolder(), loadAllFilesForFiltering()]);
        } catch (error) {
            console.error("Failed to restore items:", error);
        }
    };


    const handleDownloadSelection = useCallback(async () => {
        if (selectedItems.size === 0 || isDownloading) return;

        setIsDownloading(true);
        const itemsToDownload = allFiles.filter((f): f is GalleryFile => selectedItems.has(f.id) && f.type === 'file');

        try {
            if (itemsToDownload.length === 1) {
                const item = itemsToDownload[0];
                const link = document.createElement('a');
                link.href = item.url;
                link.download = item.name;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else if (itemsToDownload.length > 1) {
                const zip = new JSZip();
                for (const item of itemsToDownload) {
                    const response = await fetch(item.url);
                    const blob = await response.blob();
                    const imageNameWithoutExt = stripExtension(item.name);
                    zip.file(`${imageNameWithoutExt}/${item.name}`, blob);
                }

                const content = await zip.generateAsync({ type: "blob" });

                const url = URL.createObjectURL(content);
                const link = document.createElement('a');
                link.href = url;
                link.download = `pixshop_images_${new Date().toISOString().split('T')[0]}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            console.error("Failed to download files:", error);
            alert("Ocorreu um erro ao preparar o download. Por favor, tente novamente.");
        } finally {
            setIsDownloading(false);
        }
    }, [selectedItems, allFiles, isDownloading]);

    const handleNavigate = (folderId: string) => {
        setBrandFilter('');
        setDateFilter('');
        setSearchQuery('');
        setCurrentFolderId(folderId);
        setSelectedItems(new Set());
    };

    const handleItemPrimaryAction = (item: GalleryItem) => {
        if (renamingId) return; // Don't do anything if renaming
        if (item.type === 'folder') {
            handleNavigate(item.id);
        } else {
            openPreview(item as GalleryFile);
        }
    };

    // Selection Logic
    const handleCheckboxToggle = (itemId: string) => {
        setSelectedItems(prev => {
            const newSelection = new Set(prev);
            if (newSelection.has(itemId)) {
                newSelection.delete(itemId);
            } else {
                newSelection.add(itemId);
            }
            return newSelection;
        });
    };

    const areAllVisibleSelected = useMemo(() => {
        const visibleItemIds = displayedItems.map(i => i.id);
        if (visibleItemIds.length === 0) return false;
        return visibleItemIds.every(id => selectedItems.has(id));
    }, [displayedItems, selectedItems]);

    const handleToggleSelectAll = () => {
        setSelectedItems(prev => {
            const newSelection = new Set(prev);
            const visibleItemIds = displayedItems.map(i => i.id);
            if (areAllVisibleSelected) {
                visibleItemIds.forEach(id => newSelection.delete(id));
            } else {
                visibleItemIds.forEach(id => newSelection.add(id));
            }
            return newSelection;
        });
    };

    const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverTarget(null); // Reset visual state on drop
        try {
            const token = await getToken();
            if (!token) throw new Error("Token not available");

            const data = e.dataTransfer.getData('application/json');
            if (!data) return; // Exit if no data, e.g., external file drag

            const itemIds = JSON.parse(data);
            if (Array.isArray(itemIds) && itemIds.length > 0) {
                if (itemIds.includes(targetFolderId)) return; // Can't drop a folder into itself
                await moveItems(itemIds, targetFolderId, token);
                setSelectedItems(new Set()); // Clear selection after moving
                await refreshItemsInCurrentFolder();
            }
        } catch (error) {
            console.error("Drop failed:", error);
        }
    };

    // Drag and Drop Logic
    const handleDragStart = (e: React.DragEvent, itemId: string) => {
        if (isFiltering || isTrashView) {
            e.preventDefault();
            return;
        }
        const itemsToDrag = selectedItems.has(itemId) ? Array.from(selectedItems) : [itemId];
        e.dataTransfer.setData('application/json', JSON.stringify(itemsToDrag));
        e.dataTransfer.effectAllowed = 'move';
    };
    
    const handleDragEnd = () => {
        setDragOverTarget(null);
    };
    
    const renderCreateFolderGridItem = () => (
        <div className="relative aspect-square rounded-lg bg-blue-50 border-2 border-dashed border-blue-400 flex flex-col items-center justify-center p-2">
            <form onSubmit={handleSaveNewFolder} className="text-center">
                <FolderIcon className="w-16 h-16 text-blue-400" />
                <input
                    ref={newFolderInputRef}
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onBlur={() => setIsCreatingFolder(false)} // Cancel on blur
                    className="w-full text-center text-xs bg-white border border-blue-400 rounded px-1 py-0.5 outline-none mt-2"
                />
            </form>
        </div>
    );
    
    const renderCreateFolderListItem = () => (
        <tr className="bg-blue-50">
            <td className="px-6 py-4"></td>
            <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap" colSpan={isFiltering ? 4 + metadataHeaders.length : 3 + metadataHeaders.length}>
                <form onSubmit={handleSaveNewFolder} className="flex items-center gap-3">
                    <FolderIcon className="w-5 h-5 text-blue-400" />
                    <input
                        ref={newFolderInputRef}
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onBlur={() => setIsCreatingFolder(false)}
                        className="w-full text-sm bg-white border border-blue-400 rounded px-2 py-1 outline-none"
                    />
                </form>
            </td>
            <td className="px-6 py-4 text-right">
                <button onClick={handleSaveNewFolder} className="font-semibold text-blue-600 hover:underline">Salvar</button>
            </td>
        </tr>
    );

    const renderGridItem = (item: GalleryItem) => (
        <div
            key={item.id}
            data-item-id={item.id}
            className={`relative aspect-square rounded-lg shadow-md border group cursor-pointer transition-all duration-200
                ${selectedItems.has(item.id) ? 'border-blue-500 ring-2 ring-blue-500 scale-95' : 'border-gray-200'}
                ${item.type === 'folder' && dragOverTarget === item.id ? 'bg-blue-100 border-blue-400' : 'bg-gray-100'}
            `}
            onClick={() => handleItemPrimaryAction(item)}
            draggable={!isFiltering && !isTrashView}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => {
                if (item.type === 'folder') {
                    e.preventDefault();
                    setDragOverTarget(item.id);
                }
            }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(e) => {
                if (item.type === 'folder') {
                    handleDrop(e, item.id);
                }
            }}
        >
             <div 
                className="absolute top-2 left-2 z-10 p-0.5"
                onClick={(e) => {
                    e.stopPropagation();
                    handleCheckboxToggle(item.id);
                }}
            >
                <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all cursor-pointer ${selectedItems.has(item.id) ? 'bg-blue-600 border-blue-500' : 'bg-white/70 border-gray-400 group-hover:border-blue-500'}`}>
                    {selectedItems.has(item.id) && <CheckIcon className="w-4 h-4 text-white" />}
                </div>
            </div>

            {item.type === 'file' ? (
                <img src={item.url} alt={item.name} className="w-full h-full object-cover rounded-lg" />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <FolderIcon className="w-16 h-16" />
                </div>
            )}
            <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/60 to-transparent">
                {renamingId === item.id ? (
                    <form onSubmit={handleSaveRename}><input ref={renameInputRef} type="text" value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)} onBlur={handleSaveRename} onClick={e => e.stopPropagation()}
                        className="w-full text-xs text-white bg-gray-800/80 border border-blue-400 rounded px-1 py-0.5 outline-none"
                    /></form>
                ) : (
                    <p className="text-white text-xs font-semibold truncate" title={item.name}>
                        {item.type === 'file' ? stripExtension(item.name) : item.name}
                    </p>
                )}
            </div>
            <div className="absolute top-2 right-2">
                <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === item.id ? null : item.id) }} className="p-1 bg-white/70 rounded-full hover:bg-white transition opacity-0 group-hover:opacity-100">
                    <EllipsisVerticalIcon className="w-5 h-5 text-gray-800" />
                </button>
                {activeMenu === item.id && renderMenu(item)}
            </div>
        </div>
    );

    const renderListItem = (item: GalleryItem) => (
        <tr
            key={item.id}
            data-item-id={item.id}
            className={`border-b transition-colors duration-200 group
                ${selectedItems.has(item.id) ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}
                ${item.type === 'folder' && dragOverTarget === item.id ? 'bg-blue-100' : ''}
            `}
            draggable={!isFiltering && !isTrashView}
            onDragStart={(e) => handleDragStart(e, item.id)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => {
                if (item.type === 'folder') {
                    e.preventDefault();
                    setDragOverTarget(item.id);
                }
            }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(e) => {
                if (item.type === 'folder') {
                    handleDrop(e, item.id);
                }
            }}
        >
            <td className="px-6 py-4">
                <div 
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${selectedItems.has(item.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleCheckboxToggle(item.id);
                    }}
                >
                    {selectedItems.has(item.id) && <CheckIcon className="w-3 h-3 text-white" />}
                </div>
            </td>
            <td 
                className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap cursor-pointer"
                onClick={() => handleItemPrimaryAction(item)}
            >
                <div className="flex items-center gap-3">
                    {item.type === 'folder' ? <FolderIcon className="w-5 h-5 text-gray-400" /> : <div className="w-8 h-8 rounded overflow-hidden bg-gray-200 flex-shrink-0"><img src={item.url} className="w-full h-full object-cover"/></div>}
                    {renamingId === item.id ? (
                        <form onSubmit={handleSaveRename}><input ref={renameInputRef} type="text" value={renamingValue}
                            onChange={(e) => setRenamingValue(e.target.value)} onBlur={handleSaveRename} onClick={e => e.stopPropagation()}
                            className="w-full text-sm bg-white border border-blue-400 rounded px-2 py-1 outline-none"
                        /></form>
                    ) : (
                        <span>{item.type === 'file' ? stripExtension(item.name) : item.name}</span>
                    )}
                </div>
            </td>
            {isFiltering && item.type === 'file' && <td className="px-6 py-4">{item.metadata?.['marca'] || '—'}</td>}
            <td className="px-6 py-4">{new Date(item.timestamp).toLocaleString()}</td>
            <td className="px-6 py-4">{item.type === 'file' ? formatBytes(item.size) : '—'}</td>
            {metadataHeaders.map(header => (
                <td key={header} className="px-6 py-4">{item.type === 'file' ? (item.metadata?.[header] ?? '—') : '—'}</td>
            ))}
            <td className="px-6 py-4 text-right relative">
                 <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === item.id ? null : item.id) }} className="p-1 rounded-full hover:bg-gray-200 transition">
                        <EllipsisVerticalIcon className="w-5 h-5 text-gray-600" />
                    </button>
                    {activeMenu === item.id && renderMenu(item)}
                 </div>
            </td>
        </tr>
    );
    
    const renderMenu = (item: GalleryItem) => (
        <div ref={menuRef} onClick={e => e.stopPropagation()} className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-20 border border-gray-200">
            {item.type === 'file' && <a onClick={() => onLoadImage(item as StoredImage)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"><PencilIcon className="w-4 h-4" /> Editar Imagem</a>}
            {!isTrashView && <a onClick={() => handleRename(item.id, item.name)} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"><PencilIcon className="w-4 h-4" /> Renomear</a>}
            {item.type === 'file' && <a onClick={() => handleDownloadSelection()} className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"><ArrowDownTrayIcon className="w-4 h-4" /> Baixar</a>}
            <a onClick={() => {
                if (!selectedItems.has(item.id)) {
                    setSelectedItems(new Set([item.id]));
                }
                handleInitiateDelete();
            }} className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"><TrashIcon className="w-4 h-4" /> Apagar</a>
        </div>
    );

    return (
    <>
      <div className="w-full max-w-7xl mx-auto flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-gray-800">Galeria de Criações</h2>
              {trashFolderId && (
                <button onClick={() => handleNavigate(trashFolderId)} className="flex items-center gap-2 bg-white text-gray-600 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-gray-100 hover:text-gray-800 transition">
                    <TrashIcon className="w-5 h-5" /> Lixeira
                </button>
              )}
          </div>

          <div data-gallery-actions className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 bg-gray-100/80 border border-gray-200 rounded-lg backdrop-blur-sm">
             <div className="flex items-center gap-2 flex-wrap">
                {isTrashView ? (
                    <>
                        <button onClick={handleRestoreSelection} disabled={selectedItems.size === 0} className="flex items-center gap-2 bg-white text-blue-600 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-blue-50 disabled:opacity-50 disabled:text-gray-500 disabled:cursor-not-allowed transition">
                            <RestoreIcon className="w-5 h-5" /> Restaurar
                        </button>
                    </>
                ) : (
                    <button onClick={handleInitiateCreateFolder} disabled={isFiltering || confirmingDelete} className="flex items-center gap-2 bg-white text-gray-800 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-gray-50 transition disabled:opacity-50">
                        <FolderPlusIcon className="w-5 h-5" /> Nova Pasta
                    </button>
                )}

                {confirmingDelete ? (
                    <>
                        <span className="font-semibold text-red-700 animate-pulse hidden sm:inline">{isTrashView ? 'Apagar permanentemente?' : 'Mover para lixeira?'}</span>
                        <button onClick={handleConfirmDelete} className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm border border-red-700 hover:bg-red-700 transition">
                            Sim
                        </button>
                        <button onClick={handleCancelDelete} className="flex items-center gap-2 bg-white text-gray-800 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-gray-50 transition">
                            Cancelar
                        </button>
                    </>
                ) : (
                    <button onClick={handleInitiateDelete} disabled={selectedItems.size === 0} className="flex items-center gap-2 bg-white text-red-600 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-red-50 disabled:opacity-50 disabled:text-gray-500 disabled:cursor-not-allowed transition">
                        <TrashIcon className="w-5 h-5" /> {isTrashView ? 'Apagar Permanentemente' : 'Apagar'}
                    </button>
                )}

                 <button onClick={handleToggleSelectAll} disabled={confirmingDelete} className="flex items-center gap-2 bg-white text-gray-800 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-gray-50 transition">
                    {areAllVisibleSelected ? 'Desselecionar' : 'Selecionar Todos'}
                </button>
                <button onClick={handleDownloadSelection} disabled={selectedItems.size === 0 || isDownloading || confirmingDelete} className="flex items-center gap-2 bg-white text-blue-600 font-semibold py-2 px-4 rounded-md shadow-sm border border-gray-300 hover:bg-blue-50 disabled:opacity-50 disabled:text-gray-500 disabled:cursor-not-allowed transition">
                    <ArrowDownTrayIcon className="w-5 h-5" />
                    {isDownloading ? 'Baixando...' : `Baixar (${selectedItems.size})`}
                </button>
             </div>
             <div className="flex items-center p-1 bg-gray-200 rounded-lg">
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-white shadow' : 'text-gray-500'}`}><Squares2X2Icon className="w-5 h-5" /></button>
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white shadow' : 'text-gray-500'}`}><ListBulletIcon className="w-5 h-5" /></button>
             </div>
          </div>
          
           <div data-gallery-filters className="flex flex-col sm:flex-row items-center gap-4 p-2 bg-white/80 border border-gray-200 rounded-lg backdrop-blur-sm">
                <div className="relative w-full sm:w-auto flex-grow">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome, SKU, etc..."
                        className="w-full bg-white border-gray-300 text-gray-800 rounded-md py-2 pl-10 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')} 
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                            aria-label="Limpar busca"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)} className="w-full sm:w-auto bg-white border border-gray-300 text-gray-800 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">Todas as Marcas</option>
                    {availableBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                </select>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value as DateFilter)} className="w-full sm:w-auto bg-white border border-gray-300 text-gray-800 rounded-md py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                    <option value="">Qualquer Data</option>
                    <option value="today">Hoje</option>
                    <option value="7days">Últimos 7 dias</option>
                    <option value="30days">Últimos 30 dias</option>
                </select>
                {isFiltering && <button onClick={() => { setBrandFilter(''); setDateFilter(''); setSearchQuery(''); }} className="text-sm font-semibold text-blue-600 hover:underline">Limpar Filtros</button>}
            </div>

          <div className="flex items-center gap-2 text-sm font-medium text-gray-500 p-2 bg-white rounded-lg border">
            {isFiltering ? ( 
                <div className="flex items-center gap-2">
                    <MagnifyingGlassIcon className="w-5 h-5 text-gray-400" />
                    <span className="font-bold text-gray-700">
                        {searchQuery.trim() ? `Resultados para: "${searchQuery.trim()}"` : "Exibindo resultados filtrados"}
                    </span>
                </div>
            ) : (
                path.map((p, index) => (
                    <React.Fragment key={p.id}>
                        <button onClick={() => handleNavigate(p.id)} className="hover:text-blue-600 hover:underline">
                            {p.name}
                        </button>
                        {index < path.length - 1 && <ChevronRightIcon className="w-4 h-4 text-gray-400" />}
                    </React.Fragment>
                ))
            )}
          </div>

          <div className="flex-grow min-h-[400px]"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
                if (!isFiltering) {
                    handleDrop(e, 'root');
                }
            }}
          >
            {isLoading ? (
                <div className="flex items-center justify-center h-full text-center py-20">
                    <Spinner />
                </div>
            ) : displayedItems.length > 0 || isCreatingFolder ? (
                viewMode === 'grid' ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {isCreatingFolder && !isFiltering && renderCreateFolderGridItem()}
                        {displayedItems.map(renderGridItem)}
                    </div>
                ) : (
                    <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 w-12">
                                        <div 
                                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${areAllVisibleSelected ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}
                                            onClick={handleToggleSelectAll}
                                        >
                                            {areAllVisibleSelected && <CheckIcon className="w-3 h-3 text-white" />}
                                        </div>
                                    </th>
                                    <th scope="col" className="px-6 py-3">Nome</th>
                                    {isFiltering && <th scope="col" className="px-6 py-3">Marca</th>}
                                    <th scope="col" className="px-6 py-3">Data</th>
                                    <th scope="col" className="px-6 py-3">Tamanho</th>
                                    {metadataHeaders.map(header => (
                                        <th key={header} scope="col" className="px-6 py-3 capitalize">{header}</th>
                                    ))}
                                    <th scope="col" className="px-6 py-3"><span className="sr-only">Ações</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {isCreatingFolder && !isFiltering && renderCreateFolderListItem()}
                                {displayedItems.map(renderListItem)}
                            </tbody>
                        </table>
                    </div>
                )
            ) : (
                <div className="flex items-center justify-center h-full text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed">
                    <p className="text-gray-500">{isFiltering ? "Nenhum item corresponde à sua busca ou filtros." : isTrashView ? "A lixeira está vazia." : "Esta pasta está vazia."}</p>
                </div>
            )}
          </div>
        </div>
      <PreviewModal
        isOpen={previewState.isOpen}
        onClose={() => setPreviewState({isOpen: false, index: 0})}
        images={displayedItems.filter(i => i.type === 'file') as GalleryFile[]}
        startIndex={previewState.index}
      />
    </>
    );
};

export default GalleryView;