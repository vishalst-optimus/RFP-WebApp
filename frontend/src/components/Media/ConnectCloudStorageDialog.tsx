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
  Card,
  CardContent,
  Avatar,
  Chip,
  useTheme,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Cloud as GoogleDriveIcon,
  Link as SharePointIcon,
  Check as CheckIcon,
  Upload as UploadIcon,
  Folder as FolderIcon
} from '@mui/icons-material';
import { useSharePoint } from '../../hooks/useSharePoint';
import { useGoogleDrive } from '../../hooks/useGoogleDrive';

interface ConnectCloudStorageDialogProps {
  open: boolean;
  onClose: () => void;
  onFilesSelected?: (files: Array<{ name: string; url: string; source: 'drive' | 'sharepoint' }>) => void;
}

interface CloudProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  connected: boolean;
  account?: string;
}

const ConnectCloudStorageDialog: React.FC<ConnectCloudStorageDialogProps> = ({ 
  open, 
  onClose, 
  onFilesSelected 
}) => {
  const theme = useTheme();
  
  // SharePoint integration
  const {
    isConnected: sharePointConnected,
    isLoading: sharePointLoading,
    error: sharePointError,
    userInfo,
    checkConnection,
    authenticateSharePoint,
    disconnectSharePoint,
    goToOneDrive,
    clearError
  } = useSharePoint();

  // Google Drive integration
  const {
    isConnected: googleDriveConnected,
    isLoading: googleDriveLoading,
    error: googleDriveError,
    userInfo: googleDriveUserInfo,
    authenticateGoogleDrive,
    disconnectGoogleDrive,
    clearError: clearGoogleDriveError
  } = useGoogleDrive();

  const [providers] = useState<CloudProvider[]>([
    {
      id: 'google-drive',
      name: 'Google Drive',
      icon: <GoogleDriveIcon sx={{ color: '#4285F4' }} />,
      description: 'Upload files from Google Drive',
      connected: googleDriveConnected,
      account: googleDriveUserInfo?.email
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      icon: <SharePointIcon sx={{ color: '#0078D4' }} />,
      description: 'Upload files from SharePoint',
      connected: sharePointConnected,
      account: userInfo?.mail
    }
  ]);

  // Clear Google Drive errors when connection is successful
  useEffect(() => {
    if (googleDriveConnected && googleDriveError) {
      clearGoogleDriveError();
    }
  }, [googleDriveConnected, googleDriveError, clearGoogleDriveError]);

  const handleUploadFromGoogleDrive = () => {
    if (onFilesSelected) {
      onFilesSelected([{ name: '', url: '', source: 'drive' }]); // Trigger Google Drive file picker
    }
    onClose();
  };

  const handleUploadFromSharePoint = async () => {
    try {
      if (onFilesSelected) {
        onFilesSelected([{ name: '', url: '', source: 'sharepoint' }]); // Trigger SharePoint file picker
      }
    } catch (error) {
      console.error('Failed to open SharePoint file picker:', error);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    try {
      await disconnectGoogleDrive();
    } catch (error) {
      console.error('Failed to disconnect Google Drive:', error);
    }
  };

  const handleDisconnectSharePoint = async () => {
    try {
      await disconnectSharePoint();
    } catch (error) {
      console.error('SharePoint disconnection failed:', error);
    }
  };

  const handleConnectProvider = async (providerId: string) => {
    if (providerId === 'sharepoint') {
      try {
        clearError(); // Clear any previous errors
        // Only authenticate when user explicitly clicks connect
        await authenticateSharePoint();
      } catch (error) {
        console.error('SharePoint connection failed:', error);
      }
    } else if (providerId === 'google-drive') {
      try {
        clearGoogleDriveError(); // Clear any previous errors
        await authenticateGoogleDrive();
      } catch (error) {
        console.error('Google Drive connection failed:', error);
      }
    } else {
      // Handle connecting to other providers
      console.log('Connect to provider:', providerId);
    }
  };

  // Clear Google Drive errors when connection is successful
  useEffect(() => {
    if (googleDriveConnected && googleDriveError) {
      clearGoogleDriveError();
    }
  }, [googleDriveConnected, googleDriveError, clearGoogleDriveError]);

  // Clear SharePoint errors when connection is successful
  useEffect(() => {
    if (sharePointConnected && sharePointError) {
      clearError();
    }
  }, [sharePointConnected, sharePointError, clearError]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          minHeight: '500px'
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start',
        pb: 2,
        borderBottom: 'none'
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
            Connect Cloud Storage
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Connect your cloud drive to upload files directly to your RFP
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: theme.palette.text.secondary, mt: -1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 3 }}>
          Choose a provider to connect:
        </Typography>

        {/* Provider Cards */}
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          {providers.map((provider) => {
            const isConnected = provider.id === 'sharepoint' ? sharePointConnected : provider.connected;
            return (
              <Card
                key={provider.id}
                sx={{
                  flex: 1,
                  cursor: isConnected ? 'default' : 'pointer',
                  border: isConnected ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                  backgroundColor: isConnected ? theme.palette.action.selected : theme.palette.background.paper,
                  position: 'relative',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': isConnected ? {} : {
                    borderColor: theme.palette.primary.main,
                    transform: 'translateY(-2px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                  }
                }}
                onClick={() => !isConnected && handleConnectProvider(provider.id)}
              >
                {isConnected && (
                  <CheckIcon
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      color: theme.palette.primary.main,
                      fontSize: '20px'
                    }}
                  />
                )}
                <CardContent sx={{ textAlign: 'center', py: 3 }}>
                  <Box sx={{ mb: 2 }}>
                    {provider.icon}
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 1 }}>
                    {provider.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.875rem' }}>
                    {provider.description}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>

        {/* Error Messages */}
        {sharePointError && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <IconButton size="small" onClick={clearError}>
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500, mb: sharePointError.includes('popup') ? 1 : 0 }}>
                SharePoint Error: {sharePointError}
              </Typography>
              {sharePointError.includes('popup') && (
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontSize: '0.875rem' }}>
                  💡 To fix this: Allow popups in your browser settings, then try connecting again.
                </Typography>
              )}
            </Box>
          </Alert>
        )}
        
        {googleDriveError && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <IconButton size="small" onClick={clearGoogleDriveError}>
                <CloseIcon fontSize="small" />
              </IconButton>
            }
          >
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Google Drive Error: {googleDriveError}
              </Typography>
            </Box>
          </Alert>
        )}

        {/* Connected Accounts Section */}
        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 2 }}>
          Connected Accounts:
        </Typography>

        {/* Google Drive Card */}
        <Card
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: googleDriveConnected ? theme.palette.action.hover : theme.palette.background.paper,
            mb: 2
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar
                sx={{
                  backgroundColor: theme.palette.action.selected,
                  width: 40,
                  height: 40
                }}
              >
                <GoogleDriveIcon sx={{ color: '#4285F4' }} />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                    Google Drive
                  </Typography>
                  {googleDriveLoading ? (
                    <CircularProgress size={16} />
                  ) : googleDriveConnected ? (
                    <Chip
                      icon={<CheckIcon sx={{ fontSize: '14px !important' }} />}
                      label="Connected"
                      size="small"
                      sx={{
                        backgroundColor: theme.palette.success.main,
                        color: theme.palette.success.contrastText,
                        fontSize: '0.75rem',
                        height: '24px',
                        '& .MuiChip-icon': {
                          color: theme.palette.success.contrastText
                        }
                      }}
                    />
                  ) : (
                    <Chip
                      label="Not Connected"
                      size="small"
                      sx={{
                        backgroundColor: theme.palette.error.main,
                        color: theme.palette.error.contrastText,
                        fontSize: '0.75rem',
                        height: '24px'
                      }}
                    />
                  )}
                </Box>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {googleDriveConnected && googleDriveUserInfo ? googleDriveUserInfo.email : 'Sign in with your Google account to access Google Drive files'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                fullWidth
                startIcon={googleDriveConnected ? <FolderIcon /> : <UploadIcon />}
                onClick={googleDriveConnected ? handleUploadFromGoogleDrive : () => handleConnectProvider('google-drive')}
                disabled={googleDriveLoading}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  backgroundColor: googleDriveConnected ? theme.palette.primary.main : theme.palette.grey[600],
                  color: theme.palette.primary.contrastText,
                  '&:hover': {
                    backgroundColor: googleDriveConnected ? theme.palette.primary.dark : theme.palette.grey[700]
                  },
                  '&:disabled': {
                    backgroundColor: theme.palette.action.disabledBackground,
                    color: theme.palette.action.disabled
                  },
                  py: 1.5
                }}
              >
                {googleDriveConnected ? 'Upload from Google Drive' : 'Connect to Google Drive'}
              </Button>
              
              {googleDriveConnected && (
                <Button
                  variant="outlined"
                  onClick={handleDisconnectGoogleDrive}
                  sx={{
                    textTransform: 'none',
                    minWidth: 'auto',
                    px: 2
                  }}
                >
                  Disconnect
                </Button>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* SharePoint Card */}
        <Card
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: sharePointConnected ? theme.palette.action.hover : theme.palette.background.paper,
            mb: 3
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar
                sx={{
                  backgroundColor: theme.palette.action.selected,
                  width: 40,
                  height: 40
                }}
              >
                <SharePointIcon sx={{ color: '#0078D4' }} />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                    SharePoint / OneDrive
                  </Typography>
                  {sharePointLoading ? (
                    <CircularProgress size={16} />
                  ) : sharePointConnected ? (
                    <Chip
                      icon={<CheckIcon sx={{ fontSize: '14px !important' }} />}
                      label="Connected"
                      size="small"
                      sx={{
                        backgroundColor: theme.palette.success.main,
                        color: theme.palette.success.contrastText,
                        fontSize: '0.75rem',
                        height: '24px',
                        '& .MuiChip-icon': {
                          color: theme.palette.success.contrastText
                        }
                      }}
                    />
                  ) : (
                    <Chip
                      label="Not Connected"
                      size="small"
                      sx={{
                        backgroundColor: theme.palette.error.main,
                        color: theme.palette.error.contrastText,
                        fontSize: '0.75rem',
                        height: '24px'
                      }}
                    />
                  )}
                </Box>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {sharePointConnected && userInfo ? userInfo.mail : 'Sign in with your Microsoft account to access SharePoint files'}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                fullWidth
                startIcon={sharePointConnected ? <FolderIcon /> : <UploadIcon />}
                onClick={sharePointConnected ? handleUploadFromSharePoint : () => handleConnectProvider('sharepoint')}
                disabled={sharePointLoading}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  backgroundColor: sharePointConnected ? theme.palette.primary.main : theme.palette.grey[600],
                  color: theme.palette.primary.contrastText,
                  '&:hover': {
                    backgroundColor: sharePointConnected ? theme.palette.primary.dark : theme.palette.grey[700]
                  },
                  '&:disabled': {
                    backgroundColor: theme.palette.grey[400],
                    color: theme.palette.grey[600]
                  },
                  py: 1.5,
                  mb: sharePointError && sharePointError.includes('popup') ? 1 : 0
                }}
              >
                {sharePointLoading 
                  ? (sharePointConnected ? 'Loading...' : 'Connecting...')
                  : sharePointConnected 
                    ? 'Browse SharePoint Files' 
                    : 'Connect SharePoint'
                }
              </Button>
              
              {/* Disconnect button when connected */}
              {sharePointConnected && (
                <Button
                  variant="outlined"
                  onClick={handleDisconnectSharePoint}
                  disabled={sharePointLoading}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    color: theme.palette.error.main,
                    borderColor: theme.palette.error.main,
                    '&:hover': {
                      backgroundColor: theme.palette.error.light,
                      borderColor: theme.palette.error.main
                    },
                    minWidth: '100px'
                  }}
                >
                  Disconnect
                </Button>
              )}
            </Box>
            
            {/* Retry button for popup issues */}
            {sharePointError && sharePointError.includes('popup') && (
              <Button
                variant="outlined"
                fullWidth
                onClick={() => authenticateSharePoint()}
                disabled={sharePointLoading}
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  color: theme.palette.primary.main,
                  borderColor: theme.palette.primary.main,
                  '&:hover': {
                    backgroundColor: theme.palette.action.hover,
                    borderColor: theme.palette.primary.main
                  },
                  mt: 1
                }}
              >
                Retry Connection
              </Button>
            )}
          </CardContent>
        </Card>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        justifyContent: 'flex-end'
      }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark
            },
            px: 4
          }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConnectCloudStorageDialog;