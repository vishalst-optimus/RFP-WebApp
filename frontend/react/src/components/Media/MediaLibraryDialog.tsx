import React, { useState } from 'react';
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
  ListItemSecondaryAction
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  CloudUpload as UploadIcon,
  Link as LinkIcon,
  ViewModule as GridViewIcon,
  ViewList as ListViewIcon,
  Cloud as DriveIcon,
  Share as SharePointIcon,
  Description as DocumentIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import ConnectCloudStorageDialog from './ConnectCloudStorageDialog';

interface MediaLibraryDialogProps {
  open: boolean;
  onClose: () => void;
}

interface MediaItem {
  id: string;
  name: string;
  type: 'image' | 'document' | 'certificate';
  size: string;
  source: 'drive' | 'sharepoint';
  thumbnail: string;
  url: string;
}

const MediaLibraryDialog: React.FC<MediaLibraryDialogProps> = ({ open, onClose }) => {
  console.log('MediaLibraryDialog render - open:', open);
  
  const [activeTab, setActiveTab] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [fileFilter, setFileFilter] = useState('All Files (11)');
  const [cloudStorageOpen, setCloudStorageOpen] = useState(false);

  // Mock data for media items
  const mediaItems: MediaItem[] = [
    {
      id: '1',
      name: 'Company Logo Primary',
      type: 'image',
      size: '43.9 KB',
      source: 'drive',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '2',
      name: 'Company Logo White',
      type: 'image',
      size: '37.1 KB',
      source: 'drive',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '3',
      name: 'Company Icon',
      type: 'image',
      size: '11.7 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '4',
      name: 'Operations Team',
      type: 'image',
      size: '156.2 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '5',
      name: 'RBC Data Center',
      type: 'image',
      size: '234.1 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '6',
      name: 'Airport Security Check',
      type: 'image',
      size: '187.5 KB',
      source: 'drive',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    // Certificate documents for list view
    {
      id: '7',
      name: 'ISO 9001 Certificate 2024',
      type: 'certificate',
      size: '239.3 KB',
      source: 'drive',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '8',
      name: 'General Liability Insurance',
      type: 'certificate',
      size: '184.6 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '9',
      name: 'Workers Compensation Certificate',
      type: 'certificate',
      size: '163.1 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '10',
      name: 'Security License Certificate',
      type: 'certificate',
      size: '217.8 KB',
      source: 'drive',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    },
    {
      id: '11',
      name: 'Professional Indemnity Insurance',
      type: 'certificate',
      size: '193.4 KB',
      source: 'sharepoint',
      thumbnail: '/api/placeholder/150/100',
      url: '#'
    }
  ];

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const getSourceIcon = (source: string) => {
    return source === 'drive' ? <DriveIcon /> : <SharePointIcon />;
  };

  const getSourceChipColor = (source: string) => {
    return source === 'drive' ? '#1976D2' : '#0078D4';
  };

  const renderMediaGrid = () => (
    <Grid container spacing={2}>
      {mediaItems.map((item) => (
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
                backgroundColor: '#F8F9FA'
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
                  color: '#1A202C',
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
                  color: '#718096',
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
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    backgroundColor: '#4299E1',
                    '&:hover': {
                      backgroundColor: '#3182CE'
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
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    color: '#DC2626',
                    borderColor: '#DC2626',
                    '&:hover': {
                      backgroundColor: '#FEF2F2',
                      borderColor: '#DC2626'
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
    <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
      {mediaItems.map((item) => (
        <ListItem
          key={item.id}
          sx={{
            border: '1px solid #E2E8F0',
            borderRadius: 2,
            mb: 1,
            backgroundColor: 'white',
            '&:hover': {
              backgroundColor: '#F8F9FA',
              borderColor: '#4299E1'
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
                backgroundColor: '#F8F9FA',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #E2E8F0'
              }}
            >
              <DocumentIcon sx={{ color: '#718096', fontSize: '20px' }} />
            </Box>
          </ListItemIcon>
          
          <ListItemText
            primary={
              <Typography variant="body1" sx={{ fontWeight: 500, color: '#1A202C' }}>
                {item.name}
              </Typography>
            }
            secondary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="body2" sx={{ color: '#718096' }}>
                  {item.size}
                </Typography>
                <Typography variant="body2" sx={{ color: '#718096' }}>
                  •
                </Typography>
                <Typography variant="body2" sx={{ color: '#718096' }}>
                  {item.type === 'certificate' ? 'Jan 15, 2024' : 'Jan 10, 2024'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#718096' }}>
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
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  backgroundColor: '#4299E1',
                  '&:hover': {
                    backgroundColor: '#3182CE'
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
                sx={{
                  textTransform: 'none',
                  fontWeight: 500,
                  color: '#DC2626',
                  borderColor: '#DC2626',
                  '&:hover': {
                    backgroundColor: '#FEF2F2',
                    borderColor: '#DC2626'
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
        borderBottom: '1px solid #E2E8F0',
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C' }}>
            Media Library
          </Typography>
          <IconButton
            onClick={() => setCloudStorageOpen(true)}
            sx={{
              color: '#4299E1',
              backgroundColor: '#E6FFFA',
              '&:hover': { backgroundColor: '#B2F5EA' },
              ml: 2,
              cursor: 'pointer'
            }}
          >
            <DriveIcon fontSize="small" />
          </IconButton>
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#718096',
              cursor: 'pointer'
            }}
            onClick={() => setCloudStorageOpen(true)}
          >
            Cloud Drives
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#718096' }}>
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
                    <Chip label="6" size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
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
                    <Chip label="0" size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
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
                    <Chip label="5" size="small" sx={{ fontSize: '0.75rem', height: '20px' }} />
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
                  color: viewMode === 'grid' ? '#4299E1' : '#718096',
                  backgroundColor: viewMode === 'grid' ? '#E6FFFA' : 'transparent',
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
                  color: viewMode === 'list' ? '#4299E1' : '#718096',
                  backgroundColor: viewMode === 'list' ? '#E6FFFA' : 'transparent',
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
                  backgroundColor: '#F8F9FA'
                }
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: '#718096' }} />
                  </InputAdornment>
                )
              }}
            />
            
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <Select
                value={fileFilter}
                onChange={(e) => setFileFilter(e.target.value)}
                sx={{
                  backgroundColor: '#F8F9FA',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#E2E8F0'
                  }
                }}
              >
                <MenuItem value="All Files (11)">All Files (11)</MenuItem>
                <MenuItem value="Images (6)">Images (6)</MenuItem>
                <MenuItem value="Documents (0)">Documents (0)</MenuItem>
                <MenuItem value="Certificates (5)">Certificates (5)</MenuItem>
              </Select>
            </FormControl>

            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                color: '#4299E1',
                borderColor: '#4299E1',
                '&:hover': {
                  backgroundColor: '#E6FFFA',
                  borderColor: '#4299E1'
                },
                '&:focus': {
                  outline: 'none',
                  boxShadow: 'none'
                },
                outline: 'none'
              }}
            >
              Upload Files
            </Button>

            <Button
              variant="outlined"
              startIcon={<LinkIcon />}
              sx={{
                textTransform: 'none',
                fontWeight: 500,
                color: '#4299E1',
                borderColor: '#4299E1',
                '&:hover': {
                  backgroundColor: '#E6FFFA',
                  borderColor: '#4299E1'
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

        <Divider sx={{ mb: 3, borderColor: '#E2E8F0' }} />

        {/* Media Content */}
        <Box sx={{ minHeight: '300px' }}>
          {viewMode === 'grid' ? renderMediaGrid() : renderMediaList()}
        </Box>
      </DialogContent>

      {/* Connect Cloud Storage Dialog */}
      <ConnectCloudStorageDialog
        open={cloudStorageOpen}
        onClose={() => setCloudStorageOpen(false)}
      />
    </Dialog>
  );
};

export default MediaLibraryDialog;