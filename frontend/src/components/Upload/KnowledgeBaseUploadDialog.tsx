import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Alert,
  Snackbar,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import KnowledgeBaseUpload from './KnowledgeBaseUpload';
import { rfpApi, SubscriptionRequiredError } from '../../services/api';

interface KnowledgeBaseUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSubscriptionRequired?: () => void;
}

const KnowledgeBaseUploadDialog: React.FC<KnowledgeBaseUploadDialogProps> = ({
  open,
  onClose,
  onSubscriptionRequired,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const handleUpload = async (files: File[], tenantId: string) => {
    setIsUploading(true);
    
    try {
      const result = await rfpApi.uploadKnowledgeBaseDocuments(files, tenantId);
      
      setNotification({
        open: true,
        message: `Successfully uploaded ${result.uploaded_files.length} file(s) to knowledge base`,
        severity: 'success',
      });
      
      // Close dialog after successful upload
      setTimeout(() => {
        onClose();
      }, 1500);
      
    } catch (error: any) {
      console.error('Knowledge base upload failed:', error);
      console.log('🚨 Dialog error type:', error.constructor.name);
      console.log('🚨 Is SubscriptionRequiredError?', error instanceof SubscriptionRequiredError);
      
      // Handle subscription-required errors specifically
      if (error instanceof SubscriptionRequiredError) {
        console.log('🚨 Handling subscription error in dialog');
        onClose(); // Close the upload dialog
        onSubscriptionRequired?.(); // Show subscription dialog
        return;
      }
      
      let errorMessage = 'Failed to upload knowledge base documents';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setNotification({
        open: true,
        message: errorMessage,
        severity: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseNotification = () => {
    setNotification(prev => ({ ...prev, open: false }));
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            minHeight: '60vh',
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          pb: 0
        }}>
          Knowledge Base Management
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: 'absolute',
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ pt: 1 }}>
          <KnowledgeBaseUpload
            onUpload={handleUpload}
            isLoading={isUploading}
            onClose={onClose}
          />
        </DialogContent>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default KnowledgeBaseUploadDialog;