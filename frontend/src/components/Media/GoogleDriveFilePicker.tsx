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
  CheckBoxOutlineBlank as CheckBoxOutlineBlankIcon,
  CloudOff as CloudOffIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';
import type { GoogleDriveFile } from '../../services/googleDriveService';
import { mediaService, type MediaItem } from '../../services/mediaService';

interface GoogleDriveFilePickerProps {
  open: boolean;
  onClose: () => void;
  onFilesSelected: (files: Array<{ 
    name: string; 
    url: string; 
    downloadUrl?: string; 
    size: number;
    id: string;
  }>) => void;
  allowMultiSelect?: boolean;
  fileTypes?: string[]; // e.g., ['image/*', 'application/pdf']
  rfpName?: string; // Optional RFP name for blob storage
}

const GoogleDriveFilePicker: React.FC<GoogleDriveFilePickerProps> = ({
  open,
  onClose,
  onFilesSelected,
  allowMultiSelect = true,
  fileTypes = [],
  rfpName
}) => {
  const theme = useTheme();
  const {
    isConnected,
    isLoading,
    error,
    userInfo,
    files,
    folderPath,
    authenticateGoogleDrive,
    disconnectGoogleDrive,
    fetchFiles,
    searchFiles,
    navigateToFolder,
    goToRoot,
    refreshFiles,
    clearError,
    getAccessToken
  } = useGoogleDrive();

  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedFiles(new Set());
      setSearchQuery('');
      setIsSearching(false);
      if (isConnected) {
        fetchFiles();
      }
    }
  }, [open, isConnected, fetchFiles]);

  const handleFileSelect = (file: GoogleDriveFile) => {
    if (file.folder) {
      // Navigate to folder
      navigateToFolder(file.id);
      return;
    }

    // Check file type filter
    if (fileTypes.length > 0 && file.mimeType) {
      const isAllowed = fileTypes.some(type => {
        if (type.endsWith('/*')) {
          const category = type.replace('/*', '');
          return file.mimeType?.startsWith(category);
        }
        return file.mimeType === type;
      });

      if (!isAllowed) {
        return;
      }
    }

    const newSelected = new Set(selectedFiles);
    
    if (allowMultiSelect) {
      if (newSelected.has(file.id)) {
        newSelected.delete(file.id);
      } else {
        newSelected.add(file.id);
      }
    } else {
      newSelected.clear();
      newSelected.add(file.id);
    }
    
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    const selectableFiles = files.filter(file => {
      if (file.folder) return false;
      
      if (fileTypes.length > 0 && file.mimeType) {
        return fileTypes.some(type => {
          if (type.endsWith('/*')) {
            const category = type.replace('/*', '');
            return file.mimeType?.startsWith(category);
          }
          return file.mimeType === type;
        });
      }
      return true;
    });

    if (selectedFiles.size === selectableFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(selectableFiles.map(f => f.id)));
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      await searchFiles(searchQuery);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    fetchFiles();
  };

  const handleConfirmSelection = async () => {
    const selectedFileObjects = files.filter(f => selectedFiles.has(f.id));
    const result = selectedFileObjects.map(file => ({
      id: file.id,
      name: file.name,
      url: file.webViewLink || '',
      downloadUrl: file.webViewLink,
      size: file.size || 0
    }));
    
    // If rfpName is provided, save to blob storage first
    if (rfpName && selectedFileObjects.length > 0) {
      setIsSaving(true);
      try {
        const accessToken = getAccessToken();
        
        const mediaItems: MediaItem[] = selectedFileObjects.map((file, index) => ({
          id: `googledrive_${file.id}_${Date.now()}_${index}`,
          name: file.name,
          type: getFileType(file.name, file.mimeType),
          url: file.webViewLink || '',
          downloadUrl: file.webViewLink,
          size: formatFileSize(file.size),
          source: 'drive' as const,
          mimeType: file.mimeType || 'application/octet-stream',
          googleDriveFileId: file.id,
          googleDriveAccessToken: accessToken
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
    
    onFilesSelected(result);
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

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const getFileIcon = (file: GoogleDriveFile) => {
    if (file.folder) {
      return <FolderIcon sx={{ color: theme.palette.primary.main }} />;
    }
    
    return <FileIcon sx={{ color: theme.palette.text.secondary }} />;
  };

  const isFileSelectable = (file: GoogleDriveFile): boolean => {
    if (file.folder) return false;
    
    if (fileTypes.length > 0 && file.mimeType) {
      return fileTypes.some(type => {
        if (type.endsWith('/*')) {
          const category = type.replace('/*', '');
          return file.mimeType?.startsWith(category);
        }
        return file.mimeType === type;
      });
    }
    return true;
  };

  if (!open) return null;

  // Authentication required
  if (!isConnected) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Connect to Google Drive
          <IconButton
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <CloudOffIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Google Drive Not Connected
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Connect your Google Drive to browse and select files.
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}
            <Button
              variant="contained"
              onClick={authenticateGoogleDrive}
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={20} /> : undefined}
            >
              {isLoading ? 'Connecting...' : 'Connect Google Drive'}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Select Files from Google Drive</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {userInfo && (
              <Chip
                label={userInfo.name}
                size="small"
                sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}
              />
            )}
            <IconButton onClick={refreshFiles} disabled={isLoading}>
              <RefreshIcon />
            </IconButton>
            <IconButton onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
            {error}
          </Alert>
        )}

        {/* Search Bar */}
        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            placeholder="Search files in Google Drive..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleSearchKeyPress}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <Button onClick={handleClearSearch} size="small">
                    Clear
                  </Button>
                </InputAdornment>
              )
            }}
            disabled={isLoading}
          />
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
              size="small"
              startIcon={isSearching ? <CircularProgress size={16} /> : <SearchIcon />}
            >
              Search
            </Button>
          </Box>
        </Box>

        {/* Breadcrumbs */}
        {!searchQuery && folderPath.length > 0 && (
          <Breadcrumbs
            separator={<NavigateNextIcon fontSize="small" />}
            sx={{ mb: 2 }}
          >
            {folderPath.map((folder, index) => (
              <Link
                key={folder.id}
                component="button"
                variant="body2"
                onClick={() => {
                  if (index === 0) {
                    goToRoot();
                  } else {
                    navigateToFolder(folder.id);
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  textDecoration: 'none',
                  color: index === folderPath.length - 1 ? 'text.primary' : 'primary.main',
                  '&:hover': {
                    textDecoration: 'underline'
                  }
                }}
              >
                {index === 0 && <HomeIcon sx={{ mr: 0.5, fontSize: 16 }} />}
                {folder.name}
              </Link>
            ))}
          </Breadcrumbs>
        )}

        {/* File Selection Options */}
        {allowMultiSelect && files.some(f => isFileSelectable(f)) && (
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Button
              size="small"
              startIcon={
                selectedFiles.size === files.filter(f => isFileSelectable(f)).length ? 
                <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />
              }
              onClick={handleSelectAll}
            >
              {selectedFiles.size > 0 ? `${selectedFiles.size} selected` : 'Select All'}
            </Button>
          </Box>
        )}

        {/* Files List */}
        <Box sx={{ height: 400, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
              <CircularProgress />
            </Box>
          ) : files.length === 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, color: 'text.secondary' }}>
              <FileIcon sx={{ fontSize: 48, mb: 1 }} />
              <Typography variant="body1">No files found</Typography>
              {searchQuery && (
                <Typography variant="body2">
                  Try adjusting your search terms
                </Typography>
              )}
            </Box>
          ) : (
            <List>
              {files.map((file, index) => {
                const isSelectable = isFileSelectable(file);
                const isSelected = selectedFiles.has(file.id);

                return (
                  <ListItem
                    key={file.id}
                    button
                    onClick={() => handleFileSelect(file)}
                    sx={{
                      borderBottom: index < files.length - 1 ? 1 : 0,
                      borderColor: 'divider',
                      bgcolor: isSelected ? 'action.selected' : 'transparent',
                      '&:hover': {
                        bgcolor: isSelected ? 'action.selected' : 'action.hover'
                      }
                    }}
                  >
                    <ListItemIcon>
                      {getFileIcon(file)}
                    </ListItemIcon>
                    <ListItemText
                      primary={file.name}
                      secondary={
                        <Box>
                          <Typography variant="caption" component="div">
                            {file.mimeType && !file.folder && `${file.mimeType} • `}
                            {formatFileSize(file.size)}
                            {file.modifiedTime && ` • Modified ${formatDate(file.modifiedTime)}`}
                          </Typography>
                        </Box>
                      }
                      sx={{
                        opacity: !file.folder && !isSelectable ? 0.5 : 1
                      }}
                    />
                    {isSelectable && (
                      <ListItemSecondaryAction>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleFileSelect(file)}
                          disabled={!isSelectable}
                        />
                      </ListItemSecondaryAction>
                    )}
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={disconnectGoogleDrive} color="error" variant="outlined">
          Disconnect
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button
          onClick={handleConfirmSelection}
          variant="contained"
          disabled={selectedFiles.size === 0 || isSaving}
          startIcon={isSaving ? <CircularProgress size={20} /> : undefined}
        >
          {isSaving ? 'Saving...' : `Select ${selectedFiles.size > 0 ? `(${selectedFiles.size})` : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GoogleDriveFilePicker;