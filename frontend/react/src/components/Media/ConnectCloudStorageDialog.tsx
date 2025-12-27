import React, { useState } from 'react';
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
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  Cloud as GoogleDriveIcon,
  Link as SharePointIcon,
  Check as CheckIcon,
  Upload as UploadIcon
} from '@mui/icons-material';

interface ConnectCloudStorageDialogProps {
  open: boolean;
  onClose: () => void;
}

interface CloudProvider {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  connected: boolean;
  account?: string;
}

const ConnectCloudStorageDialog: React.FC<ConnectCloudStorageDialogProps> = ({ open, onClose }) => {
  const [providers] = useState<CloudProvider[]>([
    {
      id: 'google-drive',
      name: 'Google Drive',
      icon: <GoogleDriveIcon sx={{ color: '#4285F4' }} />,
      description: 'Upload files from Google Drive',
      connected: true,
      account: 'admin@securitycompany.com'
    },
    {
      id: 'sharepoint',
      name: 'SharePoint',
      icon: <SharePointIcon sx={{ color: '#0078D4' }} />,
      description: 'Upload files from SharePoint',
      connected: false
    }
  ]);

  const handleUploadFromGoogleDrive = () => {
    // Handle upload from Google Drive
    console.log('Upload from Google Drive clicked');
    onClose();
  };

  const handleConnectProvider = (providerId: string) => {
    // Handle connecting to a provider
    console.log('Connect to provider:', providerId);
  };

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
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C', mb: 1 }}>
            Connect Cloud Storage
          </Typography>
          <Typography variant="body2" sx={{ color: '#718096' }}>
            Connect your cloud drive to upload files directly to your RFP
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#718096', mt: -1 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C', mb: 3 }}>
          Choose a provider to connect:
        </Typography>

        {/* Provider Cards */}
        <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
          {providers.map((provider) => (
            <Card
              key={provider.id}
              sx={{
                flex: 1,
                cursor: provider.connected ? 'default' : 'pointer',
                border: provider.connected ? '2px solid #4299E1' : '1px solid #E2E8F0',
                backgroundColor: provider.connected ? '#F0F9FF' : 'white',
                position: 'relative',
                transition: 'all 0.2s ease-in-out',
                '&:hover': provider.connected ? {} : {
                  borderColor: '#4299E1',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                }
              }}
              onClick={() => !provider.connected && handleConnectProvider(provider.id)}
            >
              {provider.connected && (
                <CheckIcon
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    color: '#4299E1',
                    fontSize: '20px'
                  }}
                />
              )}
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Box sx={{ mb: 2 }}>
                  {provider.icon}
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C', mb: 1 }}>
                  {provider.name}
                </Typography>
                <Typography variant="body2" sx={{ color: '#718096', fontSize: '0.875rem' }}>
                  {provider.description}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* Connected Accounts Section */}
        <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C', mb: 2 }}>
          Connected Accounts:
        </Typography>

        <Card
          sx={{
            border: '1px solid #E2E8F0',
            backgroundColor: '#F8F9FA',
            mb: 3
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Avatar
                sx={{
                  backgroundColor: '#E3F2FD',
                  width: 40,
                  height: 40
                }}
              >
                <GoogleDriveIcon sx={{ color: '#4285F4' }} />
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#1A202C' }}>
                    Google Drive
                  </Typography>
                  <Chip
                    icon={<CheckIcon sx={{ fontSize: '14px !important' }} />}
                    label="Connected"
                    size="small"
                    sx={{
                      backgroundColor: '#D4EDDA',
                      color: '#155724',
                      fontSize: '0.75rem',
                      height: '24px',
                      '& .MuiChip-icon': {
                        color: '#155724'
                      }
                    }}
                  />
                </Box>
                <Typography variant="body2" sx={{ color: '#718096' }}>
                  admin@securitycompany.com
                </Typography>
              </Box>
            </Box>

            <Button
              variant="contained"
              fullWidth
              startIcon={<UploadIcon />}
              onClick={handleUploadFromGoogleDrive}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                backgroundColor: '#1976D2',
                '&:hover': {
                  backgroundColor: '#1565C0'
                },
                py: 1.5
              }}
            >
              Upload from Google Drive
            </Button>
          </CardContent>
        </Card>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #E2E8F0',
        justifyContent: 'flex-end'
      }}>
        <Button
          onClick={onClose}
          variant="contained"
          sx={{
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: '#4299E1',
            '&:hover': {
              backgroundColor: '#3182CE'
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