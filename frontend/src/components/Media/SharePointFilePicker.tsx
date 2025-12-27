import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Breadcrumbs,
  Link,
  Checkbox,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Chip,
  useTheme
} from '@mui/material';
import {
  Close as CloseIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Search as SearchIcon,
  NavigateNext as NavigateNextIcon,
  Home as HomeIcon,
  CheckBox as CheckBoxIcon,
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon
} from '@mui/icons-material';
import { useSharePoint } from '../../hooks/useSharePoint';
import type { SharePointFile } from '../../services/sharePointService';
import { mediaService, type MediaItem } from '../../services/mediaService';

interface SharePointFilePickerProps {
  open: boolean;
  onClose: () => void;
  onFilesSelected: (files: Array<{ name: string; url: string; downloadUrl?: string; size: number }>) => void;
  allowMultiSelect?: boolean;
  fileTypes?: string[]; // e.g., ['image/*', 'application/pdf']
  rfpName?: string; // Optional RFP name for blob storage
}

const SharePointFilePicker: React.FC<SharePointFilePickerProps> = ({
  open,
  onClose,
  onFilesSelected,
  allowMultiSelect = true,
  fileTypes,
  rfpName
}) => {
  const theme = useTheme();
  const {
    isLoading,
    error,
    files,
    currentDriveId,
    currentFolderId,
    userInfo,
    fetchFiles,
    searchFiles,
    navigateToFolder,
    goToOneDrive,
    refreshFiles,
    clearError
  } = useSharePoint();

  const [selectedFiles, setSelectedFiles] = useState<SharePointFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ name: string; id?: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize OneDrive on dialog open
  useEffect(() => {
    if (open && !currentDriveId) {
      goToOneDrive();
      setBreadcrumbs([{ name: 'OneDrive' }]);
    } else if (open && currentDriveId) {
      // If we already have a drive selected, refresh to get the latest files
      refreshFiles();
    }
  }, [open, currentDriveId, goToOneDrive, refreshFiles]);

  // Handle search
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      await searchFiles(searchQuery);
      setBreadcrumbs([{ name: 'Search Results' }]);
    } catch (err) {
      console.error('Search failed:', err);
    }
    setIsSearching(false);
  };

  const handleSearchClear = async () => {
    setSearchQuery('');
    setIsSearching(false);
    if (currentDriveId) {
      await fetchFiles(currentDriveId, currentFolderId || undefined);
      setBreadcrumbs(currentFolderId ? [{ name: 'OneDrive' }, { name: 'Folder' }] : [{ name: 'OneDrive' }]);
    }
  };

  // Handle folder navigation
  const handleFolderClick = async (folder: SharePointFile) => {
    if (!folder.folder) return;
    
    try {
      await navigateToFolder(folder.id);
      setBreadcrumbs(prev => [...prev, { name: folder.name, id: folder.id }]);
    } catch (err) {
      console.error('Navigation failed:', err);
    }
  };

  // Handle breadcrumb navigation
  const handleBreadcrumbClick = async (index: number) => {
    if (index === 0) {
      // Go to OneDrive root
      await goToOneDrive();
      setBreadcrumbs([{ name: 'OneDrive' }]);
    } else if (index < breadcrumbs.length - 1) {
      // Navigate to specific folder
      const breadcrumb = breadcrumbs[index];
      if (breadcrumb.id) {
        await navigateToFolder(breadcrumb.id);
        setBreadcrumbs(breadcrumbs.slice(0, index + 1));
      }
    }
  };

  // Handle file selection
  const handleFileSelect = (file: SharePointFile) => {
    if (file.folder) {
      handleFolderClick(file);
      return;
    }

    if (!allowMultiSelect) {
      setSelectedFiles([file]);
      return;
    }

    setSelectedFiles(prev => {
      const isSelected = prev.some(f => f.id === file.id);
      if (isSelected) {
        return prev.filter(f => f.id !== file.id);
      } else {
        return [...prev, file];
      }
    });
  };

  // Check if file type is allowed
  const isFileTypeAllowed = (file: SharePointFile): boolean => {
    if (!fileTypes || fileTypes.length === 0) return true;
    if (!file.mimeType) return true;

    return fileTypes.some(type => {
      if (type.endsWith('/*')) {
        const baseType = type.slice(0, -2);
        return file.mimeType?.startsWith(baseType);
      }
      return file.mimeType === type;
    });
  };

  // Handle file insertion
  const handleInsertFiles = async () => {
    const filesToInsert = selectedFiles.map(file => ({
      name: file.name,
      url: file.webUrl,
      downloadUrl: file.downloadUrl,
      size: file.size
    }));
    
    // If rfpName is provided, save to blob storage first
    if (rfpName && selectedFiles.length > 0) {
      setIsSaving(true);
      try {
        const mediaItems: MediaItem[] = selectedFiles.map((file, index) => ({
          id: `sharepoint_${file.id}_${Date.now()}_${index}`,
          name: file.name,
          type: getFileType(file.name, file.mimeType),
          url: file.webUrl,
          downloadUrl: file.downloadUrl,
          size: formatFileSize(file.size),
          source: 'sharepoint' as const,
          mimeType: file.mimeType || 'application/octet-stream'
        }));

        await mediaService.insertToBlob(rfpName, mediaItems);
        console.log('Files saved to blob storage successfully');
      } catch (error) {
        console.error('Error saving files to blob storage:', error);
        // Continue with the flow even if blob storage fails
      } finally {
        setIsSaving(false);
      }
    }
    
    onFilesSelected(filesToInsert);
    onClose();
  };

  // Helper to determine file type
  const getFileType = (fileName: string, mimeType?: string): 'image' | 'document' | 'certificate' => {
    const extension = fileName.toLowerCase().split('.').pop() || '';
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico'];
    
    if (imageExtensions.includes(extension) || (mimeType && mimeType.startsWith('image/'))) {
      return 'image';
    }
    
    const lowerFileName = fileName.toLowerCase();
    const certificateKeywords = ['certificate', 'cert', 'license', 'insurance', 'liability'];
    if (certificateKeywords.some(keyword => lowerFileName.includes(keyword))) {
      return 'certificate';
    }
    
    return 'document';
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Filter files by type if specified
  const filteredFiles = files.filter(isFileTypeAllowed);
  const displayFiles = searchQuery ? filteredFiles : filteredFiles;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Browse SharePoint Files
          </Typography>
          {userInfo && (
            <Chip 
              label={userInfo.mail} 
              size="small" 
              sx={{ 
                backgroundColor: theme.palette.primary.light,
                color: theme.palette.primary.contrastText
              }} 
            />
          )}
        </Box>
        <IconButton onClick={onClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Error Message */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <IconButton size="small" onClick={clearError}>
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            {error}
          </Alert>
        )}

        {/* Search Bar */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: theme.palette.text.secondary }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleSearchClear}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: theme.palette.action.hover
              }
            }}
          />
        </Box>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
              {breadcrumbs.map((crumb, index) => (
                <Link
                  key={index}
                  component="button"
                  variant="body2"
                  onClick={() => handleBreadcrumbClick(index)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: index === breadcrumbs.length - 1 ? theme.palette.text.primary : theme.palette.primary.main,
                    textDecoration: 'none',
                    '&:hover': {
                      textDecoration: index === breadcrumbs.length - 1 ? 'none' : 'underline'
                    }
                  }}
                >
                  {index === 0 && <HomeIcon fontSize="small" />}
                  {crumb.name}
                </Link>
              ))}
            </Breadcrumbs>
          </Box>
        )}

        {/* Loading Indicator */}
        {(isLoading || isSearching) && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* File List */}
        {!isLoading && !isSearching && (
          <List sx={{ maxHeight: '400px', overflow: 'auto' }}>
            {displayFiles.map((file) => {
              const isSelected = selectedFiles.some(f => f.id === file.id);
              const isFolder = file.folder;
              
              return (
                <ListItem
                  key={file.id}
                  button
                  onClick={() => handleFileSelect(file)}
                  sx={{
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 1,
                    mb: 1,
                    backgroundColor: isSelected ? theme.palette.action.selected : theme.palette.background.paper,
                    '&:hover': {
                      backgroundColor: isSelected ? theme.palette.action.selected : theme.palette.action.hover
                    }
                  }}
                >
                  <ListItemIcon>
                    {!isFolder && allowMultiSelect && (
                      <Checkbox
                        checked={isSelected}
                        icon={<CheckBoxOutlineBlankIcon />}
                        checkedIcon={<CheckBoxIcon />}
                        sx={{ mr: 1 }}
                      />
                    )}
                    {isFolder ? (
                      <FolderIcon sx={{ color: theme.palette.warning.main }} />
                    ) : (
                      <FileIcon sx={{ color: theme.palette.info.main }} />
                    )}
                  </ListItemIcon>
                  
                  <ListItemText
                    primary={
                      <Typography 
                        variant="body1" 
                        sx={{ 
                          fontWeight: 500,
                          color: theme.palette.text.primary 
                        }}
                      >
                        {file.name}
                      </Typography>
                    }
                    secondary={
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                          {isFolder ? 'Folder' : formatFileSize(file.size)}
                        </Typography>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                          •
                        </Typography>
                        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                          {formatDate(file.lastModifiedDateTime)}
                        </Typography>
                      </Box>
                    }
                  />
                  
                  {!isFolder && !allowMultiSelect && (
                    <ListItemSecondaryAction>
                      <Button
                        variant="contained"
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFileSelect(file);
                        }}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 500
                        }}
                      >
                        Select
                      </Button>
                    </ListItemSecondaryAction>
                  )}
                </ListItem>
              );
            })}
          </List>
        )}

        {/* No files message */}
        {!isLoading && !isSearching && displayFiles.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
              {searchQuery ? 'No files found matching your search.' : 'This folder is empty.'}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        justifyContent: 'space-between'
      }}>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
          {selectedFiles.length > 0 && `${selectedFiles.length} file${selectedFiles.length === 1 ? '' : 's'} selected`}
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} sx={{ textTransform: 'none' }} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleInsertFiles}
            disabled={selectedFiles.length === 0 || isSaving}
            startIcon={isSaving ? <CircularProgress size={20} /> : undefined}
            sx={{
              textTransform: 'none',
              fontWeight: 500
            }}
          >
            {isSaving ? 'Saving...' : `Insert ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}`}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default SharePointFilePicker;