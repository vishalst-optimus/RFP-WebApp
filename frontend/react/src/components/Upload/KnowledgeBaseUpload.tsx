import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Paper,
  styled,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  Alert,
  AlertTitle,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as FileIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { msalInstance } from '../../main';

const DropZone = styled(Paper)(({ theme }) => ({
  border: `2px dashed ${theme.palette.primary.main}`,
  borderRadius: 8,
  padding: theme.spacing(4),
  textAlign: 'center',
  backgroundColor: '#F0F8FF',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  minHeight: 200,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  '&:hover': {
    borderColor: theme.palette.primary.dark,
    backgroundColor: '#E3F2FD',
  },
  '&.dragover': {
    borderColor: theme.palette.primary.dark,
    backgroundColor: '#E3F2FD',
    transform: 'scale(1.02)',
  },
}));

interface KnowledgeBaseUploadProps {
  onUpload: (files: File[], tenantId: string) => Promise<void>;
  isLoading?: boolean;
  onClose?: () => void;
}

const KnowledgeBaseUpload: React.FC<KnowledgeBaseUploadProps> = ({
  onUpload,
  isLoading = false,
  onClose,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Get current user and tenant info - simplified for testing
  const { userInfo, tenantInfo, canUpload } = useMemo(() => {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      return { userInfo: null, tenantInfo: null, canUpload: false };
    }

    const account = accounts[0];
    const tenantId = account.tenantId;
    const userId = account.homeAccountId?.split('.')[0] || account.localAccountId;
    
    // For testing - allow all users to upload
    // TODO: Add tenant/admin logic later
    const effectiveTenantId = tenantId || userId;

    return {
      userInfo: {
        id: userId,
        name: account.name || account.username,
        email: account.username,
      },
      tenantInfo: {
        id: tenantId,
        effectiveId: effectiveTenantId,
        hasOrgTenant: !!tenantId,
        isAdmin: true, // For testing purposes
      },
      canUpload: true, // Allow all users for testing
    };
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024; // 50MB limit
    });
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const validTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'text/plain',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ];
      return validTypes.includes(file.type) && file.size <= 50 * 1024 * 1024; // 50MB limit
    });
    
    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (!tenantInfo || !selectedFiles.length) return;
    
    try {
      await onUpload(selectedFiles, tenantInfo.effectiveId);
      setUploadSuccess(true);
      // Clear files after successful upload
      setTimeout(() => {
        setSelectedFiles([]);
        setUploadSuccess(false);
        onClose?.();
      }, 2000);
    } catch (error) {
      console.error('Upload failed:', error);
      // Error handling would be done by parent component
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Removed canUpload check - allowing all users for testing
  // TODO: Re-add permission logic later

  if (uploadSuccess) {
    return (
      <Card sx={{ m: 2 }}>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CheckIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" color="success.main" sx={{ mb: 1 }}>
            Upload Successful!
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Your knowledge base documents have been uploaded successfully.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
          Knowledge Base Upload
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Upload documents to enhance the knowledge base for better RFP responses.
        </Typography>
      </Box>

      {/* User and Tenant Info */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <AlertTitle>Upload Information</AlertTitle>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2">
            <strong>User:</strong> {userInfo?.name} ({userInfo?.email})
          </Typography>
          <Typography variant="body2">
            <strong>Tenant ID:</strong> {tenantInfo?.effectiveId}
          </Typography>
          {!tenantInfo?.hasOrgTenant && (
            <Typography variant="body2" color="warning.main">
              <strong>Note:</strong> Using your user ID as tenant ID (personal account)
            </Typography>
          )}
        </Box>
      </Alert>

      {/* File Upload Area */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <DropZone
            className={dragOver ? 'dragover' : ''}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
          >
            <UploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>
              Drop knowledge base documents here
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              PDF, Word, or Text files (max 10MB each)
            </Typography>
            <Button
              variant="outlined"
              component="label"
              sx={{ mt: 1 }}
            >
              Select Files
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.xlsx,.xls"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </Button>
          </DropZone>
        </CardContent>
      </Card>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6">
                Selected Files ({selectedFiles.length})
              </Typography>
              <Chip 
                label={`Total: ${formatFileSize(selectedFiles.reduce((acc, file) => acc + file.size, 0))}`}
                color="primary"
                variant="outlined"
              />
            </Box>
            
            <List>
              {selectedFiles.map((file, index) => (
                <ListItem key={index} divider>
                  <ListItemIcon>
                    <FileIcon color="primary" />
                  </ListItemIcon>
                  <ListItemText
                    primary={file.name}
                    secondary={`${formatFileSize(file.size)} • ${file.type}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleRemoveFile(index)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      {/* Upload Button */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
        {onClose && (
          <Button variant="outlined" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button
          variant="contained"
          onClick={handleUpload}
          disabled={selectedFiles.length === 0 || isLoading}
          startIcon={isLoading ? <CircularProgress size={20} /> : <UploadIcon />}
          size="large"
        >
          {isLoading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
        </Button>
      </Box>
    </Box>
  );
};

export default KnowledgeBaseUpload;