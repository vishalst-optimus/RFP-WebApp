import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  Button,
  Card,
  CardMedia,
  CardContent,
  Chip,
  Grid,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  CircularProgress,
  Alert,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  Link as LinkIcon,
  ViewModule as GridViewIcon,
  ViewList as ListViewIcon,
  Cloud as DriveIcon,
  CloudQueue as GoogleDriveIcon,
  Share as SharePointIcon,
  Description as DocumentIcon,
  Delete as DeleteIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import ConnectCloudStorageDialog from './ConnectCloudStorageDialog';
import SharePointFilePicker from './SharePointFilePicker';
import GoogleDriveFilePicker from './GoogleDriveFilePicker';
import InsertMediaDialog from './InsertMediaDialog';
import { useSharePoint } from '../../hooks/useSharePoint';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';
import { mediaService } from '../../services/mediaService';
import { rfpApi } from '../../services/api';

interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  rfpSections?: Array<{ id: string; name: string; type?: string }>;
  rfpName: string;
  onMediaInsert?: (result: any) => void;
}

interface MediaItem {
  id: string;
  name: string;
  type: 'image' | 'document' | 'certificate';
  size: string;
  source: 'drive' | 'sharepoint' | 'upload';
  thumbnail: string;
  url: string;
  downloadUrl?: string;
  mimeType?: string;
  lastModifiedDateTime?: string;
  file?: File; // Store the actual file for upload sources
  // Google Drive specific fields
  googleDriveFileId?: string;
  googleDriveAccessToken?: string | null;
}

// File type categorization utility
const categorizeFileByType = (fileName: string, mimeType?: string, forceCategory?: 'image' | 'document' | 'certificate'): 'image' | 'document' | 'certificate' => {
  // If a category is forced (e.g., when uploading from a specific tab), use that
  if (forceCategory) {
    return forceCategory;
  }
  
  const extension = fileName.toLowerCase().split('.').pop() || '';
  const lowerFileName = fileName.toLowerCase();
  
  // Check for certificate keywords in filename
  const certificateKeywords = ['certificate', 'cert', 'license', 'insurance', 'liability', 'indemnity', 'iso', 'compliance'];
  if (certificateKeywords.some(keyword => lowerFileName.includes(keyword))) {
    return 'certificate';
  }
  
  // Image file types
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico'];
  if (imageExtensions.includes(extension) || (mimeType && mimeType.startsWith('image/'))) {
    return 'image';
  }
  
  // All other files are considered documents
  return 'document';
};

// File size formatting utility
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// Generate thumbnail URL based on file type and source
const generateThumbnailUrl = (file: { name: string; url: string; downloadUrl?: string }, source: 'sharepoint' | 'drive' | 'upload'): string => {
  const extension = file.name.toLowerCase().split('.').pop() || '';
  const fileType = categorizeFileByType(file.name);
  
  // For SharePoint files, use local icons since SharePoint URLs require authentication
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  if (source === 'sharepoint') {
    if (imageExtensions.includes(extension)) {
      return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDEzVjNIMTFWMTNIMjFaIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xOCA5TDE0IDExTDE2IDEzIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=';
    }
  } else if (imageExtensions.includes(extension)) {
    // For non-SharePoint images, use the actual file as thumbnail
    return file.downloadUrl || file.url;
  }
  
  // For non-image files, return default document icons based on file type
  if (fileType === 'certificate') {
    return '/icons/default-icon.svg';
  } else if (['pdf'].includes(extension)) {
    return '/icons/pdf-icon.svg';
  } else if (['doc', 'docx'].includes(extension)) {
    return '/icons/word-icon.png';
  } else if (['xls', 'xlsx'].includes(extension)) {
    return '/icons/excel-icon.png';
  } else if (['ppt', 'pptx'].includes(extension)) {
    return '/icons/powerpoint-icon.png';
  } else {
    return '/icons/default-icon.svg';
  }
};

const MediaLibraryDialog: React.FC<MediaLibraryDialogProps> = ({ open, onClose, rfpSections = [], rfpName, onMediaInsert }) => {
  console.log('MediaLibraryDialog render - open:', open);
  
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [fileFilter, setFileFilter] = useState('All Files (11)');
  const [cloudStorageOpen, setCloudStorageOpen] = useState(false);
  const [sharePointPickerOpen, setSharePointPickerOpen] = useState(false);
  const [googleDrivePickerOpen, setGoogleDrivePickerOpen] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [insertDialogOpen, setInsertDialogOpen] = useState(false);
  const [selectedMediaItem, setSelectedMediaItem] = useState<MediaItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importUrlOpen, setImportUrlOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [loadingBlobData, setLoadingBlobData] = useState(false);
  const [blobDataError, setBlobDataError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // SharePoint integration
  const sharePoint = useSharePoint();
  
  // Google Drive integration
  const googleDrive = useGoogleDrive();

  // Build file input accept filter based on active tab
  const acceptForActiveTab = useMemo(() => {
    // Images tab - accept only images
    if (activeTab === 0) {
      return 'image/*';
    }
    // Documents tab - accept only documents
    if (activeTab === 1) {
      return [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.pdf', '.doc', '.docx', '.txt', '.csv', '.xls', '.xlsx'
      ].join(',');
    }
    // Certificates tab - accept only images
    if (activeTab === 2) {
      return 'image/*';
    }
    return '';
  }, [activeTab]);

  // Delete media item
  const handleDeleteItem = (itemId: string) => {
    setMediaItems(prevItems => {
      const itemToDelete = prevItems.find(item => item.id === itemId);
      
      // Clean up object URLs to prevent memory leaks
      if (itemToDelete && itemToDelete.source === 'upload' && itemToDelete.thumbnail.startsWith('blob:')) {
        URL.revokeObjectURL(itemToDelete.thumbnail);
        if (itemToDelete.url.startsWith('blob:')) {
          URL.revokeObjectURL(itemToDelete.url);
        }
        if (itemToDelete.downloadUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(itemToDelete.downloadUrl);
        }
      }
      
      return prevItems.filter(item => item.id !== itemId);
    });
  };

  // Handle insert click
  const handleInsertClick = (item: MediaItem) => {
    setSelectedMediaItem(item);
    setInsertDialogOpen(true);
  };

  // Handle media insertion
  const handleMediaInsert = (insertionData: any) => {
    console.log('Media inserted:', selectedMediaItem, insertionData);
    
    // Pass the complete insertion result to the parent component
    if (insertionData && onMediaInsert) {
      onMediaInsert(insertionData);
    }
    
    setInsertDialogOpen(false);
    setSelectedMediaItem(null);
  };

  // Handle file upload click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Helper to validate files against current tab rules
  const filterFilesByActiveTab = (filesList: FileList | File[]) => {
    const files = Array.from(filesList as any as File[]);
    const imageExts = ['jpg','jpeg','png','gif','bmp','svg','webp','tiff','ico'];
    const docExts = ['pdf','doc','docx','txt','csv','xls','xlsx'];
    const docMimes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]);

    const allowed: File[] = [];
    const rejected: File[] = [];

    files.forEach(f => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const isImage = f.type.startsWith('image/') || imageExts.includes(ext);
      const isDoc = docMimes.has(f.type) || docExts.includes(ext);

      if (activeTab === 0 || activeTab === 2) {
        // Images and Certificates tabs only allow images
        (isImage ? allowed : rejected).push(f);
      } else if (activeTab === 1) {
        // Documents tab only documents
        (isDoc ? allowed : rejected).push(f);
      } else {
        allowed.push(f);
      }
    });

    return { allowed, rejected };
  };

  // Handle file selection - upload directly to blob storage
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Enforce file type restrictions for current tab
    const { allowed, rejected } = filterFilesByActiveTab(files);
    if (rejected.length > 0) {
      const msg = activeTab === 1
        ? 'Only documents are allowed in the Documents tab.'
        : 'Only images are allowed in this tab.';
      alert(`${msg}\n\nBlocked: ${rejected.map(f => f.name).slice(0,5).join(', ')}${rejected.length>5 ? '…' : ''}`);
    }
    if (allowed.length === 0) {
      // Nothing valid to upload
      if (event.target) event.target.value = '';
      return;
    }

    const fileArray = Array.from(allowed);
    
    // Upload files directly to blob storage
    await uploadFilesToBlob(fileArray);

    // Clear the input value to allow selecting the same files again
    if (event.target) {
      event.target.value = '';
    }
  };

  // Upload files to blob storage
  const uploadFilesToBlob = async (files: File[]) => {
    setUploading(true);
    try {
      console.log(`🚀 Starting upload process for ${files.length} files to blob storage`);
      
      // Determine media type based on active tab
      const mediaType = activeTab === 0 ? 'image' : activeTab === 1 ? 'document' : 'certificate';
      
      // Call the blob storage API
      const response = await rfpApi.uploadFilesToBlob(rfpName, files, mediaType);
      
      console.log('📦 Blob storage API response:', response);
      
      const newMediaItems: MediaItem[] = [];

      // Process uploaded images
      if (response.images && Array.isArray(response.images)) {
        response.images.forEach((img: any, index: number) => {
          newMediaItems.push({
            id: `blob_image_${Date.now()}_${index}`,
            name: img.name,
            type: 'image',
            size: img.size,
            source: img.source || 'upload',
            thumbnail: img.blobUrl,
            url: img.blobUrl,
            downloadUrl: img.blobUrl,
            mimeType: getMimeTypeFromFileName(img.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Process uploaded documents
      if (response.documents && Array.isArray(response.documents)) {
        response.documents.forEach((doc: any, index: number) => {
          newMediaItems.push({
            id: `blob_document_${Date.now()}_${index}`,
            name: doc.name,
            type: 'document',
            size: doc.size,
            source: doc.source || 'upload',
            thumbnail: generateThumbnailUrl({ name: doc.name, url: doc.blobUrl }, 'upload'),
            url: doc.blobUrl,
            downloadUrl: doc.blobUrl,
            mimeType: getMimeTypeFromFileName(doc.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Process uploaded certificates
      if (response.certificates && Array.isArray(response.certificates)) {
        response.certificates.forEach((cert: any, index: number) => {
          newMediaItems.push({
            id: `blob_certificate_${Date.now()}_${index}`,
            name: cert.name,
            type: 'certificate',
            size: cert.size,
            source: cert.source || 'upload',
            thumbnail: cert.blobUrl,
            url: cert.blobUrl,
            downloadUrl: cert.blobUrl,
            mimeType: getMimeTypeFromFileName(cert.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Add new files to existing media items
      setMediaItems(prevItems => [...prevItems, ...newMediaItems]);
      
      console.log(`✅ Successfully uploaded ${files.length} files to blob storage`);
      
      // Show success message
      const tabName = activeTab === 0 ? 'Images' : activeTab === 1 ? 'Documents' : 'Certificates';
      alert(`Successfully uploaded ${files.length} file(s) to ${tabName}.`);
      
    } catch (error) {
      console.error('Error uploading files to blob storage:', error);
      alert(`Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  // Handle Import URL
  const handleImportUrl = async () => {
    if (!importUrl.trim()) {
      alert('Please enter a valid URL');
      return;
    }

    setImporting(true);
    try {
      console.log('🚀 Uploading file from URL to blob storage...');
      
      // Determine media type based on active tab
      const mediaType = activeTab === 0 ? 'image' : activeTab === 1 ? 'document' : 'certificate';
      
      // Call the backend API to download and upload the file
      const response = await rfpApi.uploadFileFromUrl(rfpName, importUrl, mediaType);
      
      console.log('📦 Blob storage API response:', response);
      
      const newMediaItems: MediaItem[] = [];

      // Process uploaded images
      if (response.images && Array.isArray(response.images)) {
        response.images.forEach((img: any, index: number) => {
          newMediaItems.push({
            id: `blob_image_${Date.now()}_${index}`,
            name: img.name,
            type: 'image',
            size: img.size,
            source: 'upload', // Always 'upload' for manually uploaded files
            thumbnail: img.blobUrl,
            url: img.blobUrl,
            downloadUrl: img.blobUrl,
            mimeType: getMimeTypeFromFileName(img.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Process uploaded documents
      if (response.documents && Array.isArray(response.documents)) {
        response.documents.forEach((doc: any, index: number) => {
          newMediaItems.push({
            id: `blob_document_${Date.now()}_${index}`,
            name: doc.name,
            type: 'document',
            size: doc.size,
            source: 'upload', // Always 'upload' for manually uploaded files
            thumbnail: generateThumbnailUrl({ name: doc.name, url: doc.blobUrl }, 'upload'),
            url: doc.blobUrl,
            downloadUrl: doc.blobUrl,
            mimeType: getMimeTypeFromFileName(doc.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Process uploaded certificates
      if (response.certificates && Array.isArray(response.certificates)) {
        response.certificates.forEach((cert: any, index: number) => {
          newMediaItems.push({
            id: `blob_certificate_${Date.now()}_${index}`,
            name: cert.name,
            type: 'certificate',
            size: cert.size,
            source: 'upload', // Always 'upload' for manually uploaded files
            thumbnail: cert.blobUrl,
            url: cert.blobUrl,
            downloadUrl: cert.blobUrl,
            mimeType: getMimeTypeFromFileName(cert.name),
            lastModifiedDateTime: new Date().toISOString()
          });
        });
      }

      // Add new files to existing media items
      setMediaItems(prevItems => [...prevItems, ...newMediaItems]);
      
      console.log(`✅ Successfully uploaded file from URL to blob storage`);
      
      // Show success message
      const tabName = activeTab === 0 ? 'Images' : activeTab === 1 ? 'Documents' : 'Certificates';
      alert(`Successfully imported and uploaded file to ${tabName}.`);
      
      // Reset and close dialog
      setImportUrl('');
      setImportUrlOpen(false);
      
    } catch (error) {
      console.error('Error importing URL:', error);
      alert(`Error importing URL: ${error instanceof Error ? error.message : 'Please check the URL and try again'}`);
    } finally {
      setImporting(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const getSourceIcon = (source: string) => {
    if (source === 'drive') return <DriveIcon />;
    if (source === 'sharepoint') return <SharePointIcon />;
    return <UploadIcon />; // For upload source
  };

  const getSourceChipColor = (source: string) => {
    if (source === 'drive') return theme.palette.primary.main;
    if (source === 'sharepoint') return theme.palette.info.main;
    return theme.palette.success.main; // For upload source
  };

  // Filter media items based on active tab, search query, and file filter
  const filteredMediaItems = mediaItems.filter(item => {
    // Filter by tab
    let tabMatch = true;
    if (activeTab === 0) tabMatch = item.type === 'image';
    if (activeTab === 1) tabMatch = item.type === 'document';
    if (activeTab === 2) tabMatch = item.type === 'certificate';
    
    // Filter by search query
    const searchMatch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    
    return tabMatch && searchMatch;
  });

  // Get counts for each category
  const imageCounts = mediaItems.filter(item => item.type === 'image').length;
  const documentCounts = mediaItems.filter(item => item.type === 'document').length;
  const certificateCounts = mediaItems.filter(item => item.type === 'certificate').length;
  
  // Update file filter when tab changes
  useEffect(() => {
    if (activeTab === 0) setFileFilter(`Images (${imageCounts})`);
    if (activeTab === 1) setFileFilter(`Documents (${documentCounts})`);
    if (activeTab === 2) setFileFilter(`Certificates (${certificateCounts})`);
  }, [activeTab, imageCounts, documentCounts, certificateCounts]);

  // Cleanup object URLs when component unmounts
  useEffect(() => {
    return () => {
      mediaItems.forEach(item => {
        if (item.source === 'upload') {
          if (item.thumbnail.startsWith('blob:')) {
            URL.revokeObjectURL(item.thumbnail);
          }
          if (item.url.startsWith('blob:')) {
            URL.revokeObjectURL(item.url);
          }
          if (item.downloadUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(item.downloadUrl);
          }
        }
      });
    };
  }, [mediaItems]);

  // Check SharePoint connection on component mount
  useEffect(() => {
    sharePoint.checkConnection();
  }, []);

  // Fetch blob data when dialog opens
  useEffect(() => {
    const fetchBlobData = async () => {
      if (!open || !rfpName) return;
      
      try {
        setLoadingBlobData(true);
        setBlobDataError(null);
        
        const blobData = await mediaService.getBlobData(rfpName);
        console.log('Blob data fetched:', blobData);
        
        // Transform blob data to MediaItem format
        const transformedItems: MediaItem[] = [];
        
        // Process images
        if (blobData.images && Array.isArray(blobData.images)) {
          blobData.images.forEach((img, index) => {
            transformedItems.push({
              id: `blob_image_${Date.now()}_${index}`,
              name: img.name,
              type: 'image',
              size: img.size,
              source: img.source,
              thumbnail: img.blobUrl,
              url: img.blobUrl,
              downloadUrl: img.blobUrl,
              mimeType: getMimeTypeFromFileName(img.name)
            });
          });
        }
        
        // Process documents
        if (blobData.documents && Array.isArray(blobData.documents)) {
          blobData.documents.forEach((doc, index) => {
            transformedItems.push({
              id: `blob_document_${Date.now()}_${index}`,
              name: doc.name,
              type: 'document',
              size: doc.size,
              source: doc.source,
              thumbnail: generateThumbnailUrl({ name: doc.name, url: doc.blobUrl }, doc.source),
              url: doc.blobUrl,
              downloadUrl: doc.blobUrl,
              mimeType: getMimeTypeFromFileName(doc.name)
            });
          });
        }
        
        // Process certificates
        if (blobData.certificates && Array.isArray(blobData.certificates)) {
          blobData.certificates.forEach((cert, index) => {
            transformedItems.push({
              id: `blob_certificate_${Date.now()}_${index}`,
              name: cert.name,
              type: 'certificate',
              size: cert.size,
              source: cert.source,
              thumbnail: generateThumbnailUrl({ name: cert.name, url: cert.blobUrl }, cert.source),
              url: cert.blobUrl,
              downloadUrl: cert.blobUrl,
              mimeType: getMimeTypeFromFileName(cert.name)
            });
          });
        }
        
        // Replace existing media items with blob data
        setMediaItems(transformedItems);
        
      } catch (error: any) {
        console.error('Error fetching blob data:', error);
        setBlobDataError(error?.message || 'Failed to load media files');
      } finally {
        setLoadingBlobData(false);
      }
    };
    
    fetchBlobData();
  }, [open, rfpName]);

  // Helper function to get MIME type from filename
  const getMimeTypeFromFileName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp'
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  };

  const handleSharePointFilesSelected = (files: Array<{ name: string; url: string; downloadUrl?: string; size: number }>) => {
    console.log('SharePoint files selected:', files);
    
    // Determine which category to assign based on current active tab
    // Only force category for Certificates tab, let Images and Documents use automatic detection
    let forceCategory: 'certificate' | undefined;
    if (activeTab === 2) forceCategory = 'certificate'; // Only force for certificates tab
    
    // Convert selected files to MediaItem format
    const newMediaItems: MediaItem[] = files.map((file, index) => ({
      id: `sharepoint_${Date.now()}_${index}`,
      name: file.name,
      type: categorizeFileByType(file.name, undefined, forceCategory),
      size: formatFileSize(file.size),
      source: 'sharepoint' as const,
      thumbnail: generateThumbnailUrl(file, 'sharepoint'),
      url: file.url,
      downloadUrl: file.downloadUrl,
      lastModifiedDateTime: new Date().toISOString()
    }));
    
    // Add new files to existing media items
    setMediaItems(prevItems => [...prevItems, ...newMediaItems]);
    setSharePointPickerOpen(false);
    
    // Show success message with category information
    if (forceCategory === 'certificate') {
      console.log(`Added ${files.length} files as certificates`);
    } else {
      console.log(`Added ${files.length} files with automatic categorization`);
    }
  };

  const handleGoogleDriveFilesSelected = (files: Array<{ name: string; url: string; downloadUrl?: string; size: number; id: string }>) => {
    console.log('Google Drive files selected:', files);
    
    // Get access token for backend requests
    const accessToken = googleDrive.getAccessToken();
    
    // Determine which category to assign based on current active tab
    // Only force category for Certificates tab, let Images and Documents use automatic detection
    let forceCategory: 'certificate' | undefined;
    if (activeTab === 2) forceCategory = 'certificate'; // Only force for certificates tab
    
    // Convert selected files to MediaItem format
    const newMediaItems: MediaItem[] = files.map((file, index) => ({
      id: `googledrive_${file.id}_${Date.now()}_${index}`,
      name: file.name,
      type: categorizeFileByType(file.name, undefined, forceCategory),
      size: formatFileSize(file.size),
      source: 'drive' as const,
      thumbnail: generateThumbnailUrl(file, 'drive'),
      url: file.url,
      downloadUrl: file.downloadUrl,
      lastModifiedDateTime: new Date().toISOString(),
      // Store access token and file ID for backend access
      googleDriveFileId: file.id,
      googleDriveAccessToken: accessToken
    }));
    
    // Add new files to existing media items
    setMediaItems(prevItems => [...prevItems, ...newMediaItems]);
    setGoogleDrivePickerOpen(false);
    
    // Show success message with category information
    if (forceCategory === 'certificate') {
      console.log(`Added ${files.length} files as certificates`);
    } else {
      console.log(`Added ${files.length} files with automatic categorization`);
    }
  };

  const renderMediaGrid = () => (
    <Grid container spacing={2}>
      {filteredMediaItems.map((item) => (
        <Grid item xs={12} sm={6} md={4} key={item.id}>
          <Card
            sx={{
              position: 'relative',
              cursor: 'pointer',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                '& .hover-buttons': {
                  opacity: 1,
                  visibility: 'visible'
                }
              }
            }}
          >
            <CardMedia
              component="img"
              height="120"
              image={item.thumbnail}
              alt={item.name}
              sx={{
                objectFit: 'cover',
                backgroundColor: theme.palette.action.hover
              }}
              onError={(e) => {
                // Fallback to file type icon if image fails to load
                const target = e.target as HTMLImageElement;
                const extension = item.name.toLowerCase().split('.').pop() || '';
                const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
                
                if (imageExtensions.includes(extension)) {
                  // For images that failed to load, show a generic image icon (base64 encoded SVG)
                  target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIxIDEzVjNIMTFWMTNIMjFaIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+CjxwYXRoIGQ9Ik0xOCA5TDE0IDExTDE2IDEzIiBzdHJva2U9IiM2NjY2NjYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPgo=';
                } else if (['pdf'].includes(extension)) {
                  target.src = '/icons/pdf-icon.svg';
                } else {
                  target.src = '/icons/default-icon.svg';
                }
              }}
            />
            <Chip
              icon={getSourceIcon(item.source)}
              label={item.source === 'drive' ? 'Drive' : 'SharePoint'}
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: getSourceChipColor(item.source),
                color: 'white',
                fontSize: '0.75rem',
                height: '24px',
                '& .MuiChip-icon': {
                  color: 'white',
                  fontSize: '14px'
                }
              }}
            />
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: theme.palette.text.primary,
                  mb: 0.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {item.name}
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: theme.palette.text.secondary,
                  fontSize: '0.75rem',
                  mb: 1,
                  display: 'block'
                }}
              >
                {item.size}
              </Typography>
              <Box 
                className="hover-buttons"
                sx={{ 
                  display: 'flex', 
                  gap: 1, 
                  mt: 1, 
                  justifyContent: 'flex-end',
                  opacity: 0,
                  visibility: 'hidden',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <Button
                  variant="contained"
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleInsertClick(item);
                  }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    backgroundColor: theme.palette.primary.main,
                    '&:hover': {
                      backgroundColor: theme.palette.primary.dark
                    },
                    '&:focus': {
                      outline: 'none',
                      boxShadow: 'none'
                    },
                    flex: 1,
                    fontSize: '0.75rem',
                    py: 0.4,
                    px: 1.5,
                    minHeight: '30px',
                    borderRadius: 1,
                    maxWidth: '80px',
                    outline: 'none'
                  }}
                >
                  Insert
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<DeleteIcon sx={{ fontSize: '14px' }} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteItem(item.id);
                  }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    color: theme.palette.error.main,
                    borderColor: theme.palette.error.main,
                    '&:hover': {
                      backgroundColor: theme.palette.error.light,
                      borderColor: theme.palette.error.main
                    },
                    '&:focus': {
                      outline: 'none',
                      boxShadow: 'none'
                    },
                    minWidth: '36px',
                    width: '36px',
                    fontSize: '0.75rem',
                    py: 0.4,
                    px: 0.5,
                    minHeight: '30px',
                    borderRadius: 1,
                    outline: 'none'
                  }}
                >
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );

  const renderMediaList = () => (
    <List sx={{ width: '100%', bgcolor: theme.palette.background.paper }}>
      {filteredMediaItems.map((item) => (
        <ListItem
          key={item.id}
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            mb: 1,
            backgroundColor: theme.palette.background.paper,
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
              borderColor: theme.palette.primary.main
            },
            cursor: 'pointer',
            transition: 'all 0.2s ease-in-out'
          }}
        >
          <ListItemIcon sx={{ minWidth: 56 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1,
                backgroundColor: theme.palette.action.hover,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${theme.palette.divider}`
              }}
            >
              <DocumentIcon sx={{ color: theme.palette.text.secondary, fontSize: '20px' }} />
            </Box>
          </ListItemIcon>
          
          <ListItemText
            primary={
              <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
                {item.name}
              </Typography>
            }
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {item.size}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  •
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {item.type === 'certificate' ? 'Jan 15, 2024' : 'Jan 10, 2024'}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  •
                </Typography>
                <Chip
                  icon={getSourceIcon(item.source)}
                  label={item.source === 'drive' ? 'Drive' : 'SharePoint'}
                  size="small"
                  sx={{
                    backgroundColor: getSourceChipColor(item.source),
                    color: 'white',
                    fontSize: '0.75rem',
                    height: '20px',
                    '& .MuiChip-icon': {
                      color: 'white',
                      fontSize: '12px'
                    }
                  }}
                />
              </Box>
            }
          />
          
          <ListItemSecondaryAction>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => handleInsertClick(item)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  backgroundColor: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.primary.dark
                  },
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  px: 2,
                  py: 0.4,
                  minHeight: '30px',
                  borderRadius: 1,
                  minWidth: '60px',
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              >
                Insert
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<DeleteIcon sx={{ fontSize: '14px' }} />}
                onClick={() => handleDeleteItem(item.id)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  color: theme.palette.error.main,
                  borderColor: theme.palette.error.main,
                  '&:hover': {
                    backgroundColor: theme.palette.error.light,
                    borderColor: theme.palette.error.main
                  },
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  minWidth: 'auto',
                  px: 1.2,
                  py: 0.4,
                  minHeight: '30px',
                  borderRadius: 1,
                  fontSize: '0.875rem',
                  outline: 'none'
                }}
              >
                Delete
              </Button>
            </Box>
          </ListItemSecondaryAction>
        </ListItem>
      ))}
    </List>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: '70vh',
          maxHeight: '80vh'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Media Library
          </Typography>
          <IconButton
            onClick={() => setCloudStorageOpen(true)}
            sx={{
              color: theme.palette.primary.main,
              backgroundColor: theme.palette.action.hover,
              '&:hover': { backgroundColor: theme.palette.action.selected },
              ml: 2,
              cursor: 'pointer'
            }}
          >
            <DriveIcon fontSize="small" />
          </IconButton>
          <Typography 
            variant="body2" 
            sx={{ 
              color: theme.palette.text.secondary,
              cursor: 'pointer'
            }}
            onClick={() => setCloudStorageOpen(true)}
          >
            Cloud Drives
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Header Controls */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Tabs value={activeTab} onChange={handleTabChange}>
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Images
                    <Chip label={imageCounts.toString()} size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
                  </Box>
                }
                sx={{ 
                  textTransform: 'none', 
                  fontWeight: 500,
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  outline: 'none'
                }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Documents
                    <Chip label={documentCounts.toString()} size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
                  </Box>
                }
                sx={{ 
                  textTransform: 'none', 
                  fontWeight: 500,
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  outline: 'none'
                }}
              />
              <Tab
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    Certificates
                    <Chip label={certificateCounts.toString()} size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
                  </Box>
                }
                sx={{ 
                  textTransform: 'none', 
                  fontWeight: 500,
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  outline: 'none'
                }}
              />
            </Tabs>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton
                onClick={() => setViewMode('grid')}
                sx={{
                  color: viewMode === 'grid' ? theme.palette.primary.main : theme.palette.text.secondary,
                  backgroundColor: viewMode === 'grid' ? theme.palette.action.hover : 'transparent',
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  outline: 'none'
                }}
              >
                <GridViewIcon />
              </IconButton>
              <IconButton
                onClick={() => setViewMode('list')}
                sx={{
                  color: viewMode === 'list' ? theme.palette.primary.main : theme.palette.text.secondary,
                  backgroundColor: viewMode === 'list' ? theme.palette.action.hover : 'transparent',
                  '&:focus': {
                    outline: 'none',
                    boxShadow: 'none'
                  },
                  outline: 'none'
                }}
              >
                <ListViewIcon />
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              placeholder="Search media..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{
                flexGrow: 1,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: theme.palette.action.hover
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: theme.palette.text.secondary }} />
                  </InputAdornment>
                )
              }}
            />
            
            {/* <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                sx={{
                  backgroundColor: theme.palette.action.hover,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: theme.palette.divider
                  }
                }}
              >
                <MenuItem value={`All Files (${mediaItems.length})`}>All Files ({mediaItems.length})</MenuItem>
                <MenuItem value={`Images (${imageCounts})`}>Images ({imageCounts})</MenuItem>
                <MenuItem value={`Documents (${documentCounts})`}>Documents ({documentCounts})</MenuItem>
                <MenuItem value={`Certificates (${certificateCounts})`}>Certificates ({certificateCounts})</MenuItem>
              </Select>
            </FormControl> */}

            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={handleUploadClick}
              disabled={uploading}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                color: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                  borderColor: theme.palette.primary.main
                },
                '&:focus': {
                  outline: 'none',
                  boxShadow: 'none'
                },
                outline: 'none'
              }}
            >
              {uploading ? 'Uploading...' : sharePoint.isConnected ? 'Upload to Cloud' : 'Upload Files'}
            </Button>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              accept={acceptForActiveTab}
              style={{ display: 'none' }}
            />

            <Button
              variant="outlined"
              startIcon={<LinkIcon />}
              onClick={() => setImportUrlOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                color: theme.palette.primary.main,
                borderColor: theme.palette.primary.main,
                '&:hover': {
                  backgroundColor: theme.palette.action.hover,
                  borderColor: theme.palette.primary.main
                },
                '&:focus': {
                  outline: 'none',
                  boxShadow: 'none'
                },
                outline: 'none'
              }}
            >
              Import URL
            </Button>
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: theme.palette.divider }} />

        {/* Loading State */}
        {loadingBlobData && (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '300px' 
          }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="body1" color="text.secondary">
              Loading media files...
            </Typography>
          </Box>
        )}

        {/* Error State */}
        {!loadingBlobData && blobDataError && (
          <Box sx={{ mb: 3 }}>
            <Alert severity="error" onClose={() => setBlobDataError(null)}>
              {blobDataError}
            </Alert>
          </Box>
        )}

        {/* Media Content */}
        {!loadingBlobData && !blobDataError && (
          <Box sx={{ minHeight: '300px' }}>
            {filteredMediaItems.length > 0 ? (
              viewMode === 'grid' ? renderMediaGrid() : renderMediaList()
            ) : (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: '300px',
                textAlign: 'center'
              }}>
                <Typography variant="h6" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
                  No {activeTab === 0 ? 'images' : activeTab === 1 ? 'documents' : 'certificates'} found
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mb: 3 }}>
                  Upload files or connect to Cloud Drive(s) to add {activeTab === 0 ? 'images' : activeTab === 1 ? 'documents' : 'certificates'} to your library.
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      {/* Connect Cloud Storage Dialog */}
      <ConnectCloudStorageDialog
        open={cloudStorageOpen}
        onClose={() => setCloudStorageOpen(false)}
        onFilesSelected={(files) => {
          const sharePointFiles = files.filter(f => f.source === 'sharepoint');
          const googleDriveFiles = files.filter(f => f.source === 'drive');
          
          if (sharePointFiles.length > 0) {
            setSharePointPickerOpen(true);
          } else if (googleDriveFiles.length > 0) {
            setGoogleDrivePickerOpen(true);
          }
          setCloudStorageOpen(false);
        }}
      />

      {/* SharePoint File Picker Dialog */}
      <SharePointFilePicker
        open={sharePointPickerOpen}
        onClose={() => setSharePointPickerOpen(false)}
        onFilesSelected={handleSharePointFilesSelected}
        allowMultiSelect={true}
        fileTypes={['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']}
        rfpName={rfpName}
      />

      {/* Google Drive File Picker Dialog */}
      <GoogleDriveFilePicker
        open={googleDrivePickerOpen}
        onClose={() => setGoogleDrivePickerOpen(false)}
        onFilesSelected={handleGoogleDriveFilesSelected}
        allowMultiSelect={true}
        fileTypes={['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']}
        rfpName={rfpName}
      />

      {/* Import URL Dialog */}
      <Dialog
        open={importUrlOpen}
        onClose={() => {
          setImportUrlOpen(false);
          setImportUrl('');
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LinkIcon sx={{ color: theme.palette.primary.main }} />
              <Typography variant="h6">Import File from URL</Typography>
            </Box>
            <IconButton
              onClick={() => {
                setImportUrlOpen(false);
                setImportUrl('');
              }}
              sx={{ color: theme.palette.text.secondary }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter a direct URL to a file you want to import into your media library.
            {activeTab === 2 && ' Files will be categorized as certificates.'}
            {activeTab !== 2 && ' Files will be automatically categorized based on their type.'}
          </Typography>
          
          <TextField
            fullWidth
            label="File URL"
            placeholder="https://example.com/file.pdf"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            variant="outlined"
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LinkIcon sx={{ color: theme.palette.text.secondary }} />
                </InputAdornment>
              )
            }}
          />
          
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={() => {
                setImportUrlOpen(false);
                setImportUrl('');
              }}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleImportUrl}
              disabled={importing || !importUrl.trim()}
              startIcon={importing ? undefined : <LinkIcon />}
            >
              {importing ? 'Importing...' : 'Import File'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Insert Media Dialog */}
      <InsertMediaDialog
        open={insertDialogOpen}
        onClose={() => {
          setInsertDialogOpen(false);
          setSelectedMediaItem(null);
        }}
        onInsert={handleMediaInsert}
        mediaItem={selectedMediaItem}
        rfpSections={rfpSections}
        rfpName={rfpName}
      />
    </Dialog>
  );
};

export default MediaLibraryDialog;