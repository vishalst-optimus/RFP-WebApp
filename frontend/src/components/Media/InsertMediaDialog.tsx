import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Divider,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon,
  Description as DocumentIcon,
  Image as ImageIcon
} from '@mui/icons-material';
import { mediaService, type InsertMediaRequest } from '../../services/mediaService';

interface MediaItem {
  id: string;
  name: string;
  type: 'image' | 'document' | 'certificate';
  url: string; // SharePoint web URL
  downloadUrl?: string; // Direct download URL
  size: string;
  source: 'sharepoint' | 'drive' | 'upload';
  mimeType?: string;
}

interface InsertMediaDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (insertionData: any) => void;
  mediaItem: MediaItem | null;
  rfpSections?: Array<{ id: string; name: string; type?: string }>;
  rfpName: string;
}

export const InsertMediaDialog: React.FC<InsertMediaDialogProps> = ({
  open,
  onClose,
  onInsert,
  mediaItem,
  rfpSections = [],
  rfpName
}) => {
  const [insertLocation, setInsertLocation] = useState<'section' | 'separate_page' | 'appendix'>('section');
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [displayMode, setDisplayMode] = useState<'inline' | 'figure'>('figure');
  const [caption, setCaption] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInsert = async () => {
    if (!mediaItem) return;
    
    try {
      setLoading(true);
      setError(null);

      // Validation
      if (insertLocation === 'section' && !selectedSection) {
        setError('Please select a section');
        return;
      }

      if (isImage && displayMode === 'figure' && !caption.trim()) {
        setError('Caption is required for figure display');
        return;
      }

      const selectedSectionData = rfpSections.find(s => s.name === selectedSection || s.id === selectedSection);
      
      const insertRequest: InsertMediaRequest = {
        mediaItem: {
          ...mediaItem,
          // Use downloadUrl for direct access, fallback to webUrl
          url: mediaItem.downloadUrl || mediaItem.url,
          mimeType: mediaItem.mimeType || getMimeTypeFromFileName(mediaItem.name)
        },
        insertionOptions: {
          location: {
            type: insertLocation,
            ...(insertLocation === 'section' && {
              sectionId: selectedSectionData?.id || selectedSection,
              sectionTitle: selectedSectionData?.name || selectedSection
            })
          },
          displayOptions: {
            type: isImage ? displayMode : 'inline',
            ...(caption.trim() && { caption: caption.trim() })
          }
        }
      };

      const response = await mediaService.insertMedia(rfpName, insertRequest);
      
      if (response.success) {
        // Structure the response like pricing table insertion
        const mediaInsertionResult = {
          result: response, // The entire API response
          mediaItem,
          insertRequest
        };
        onInsert(mediaInsertionResult);
        handleClose();
      } else {
        setError(response.error?.message || 'Failed to insert media');
      }
    } catch (err: any) {
      console.error('Error inserting media:', err);
      setError(err.message || 'An error occurred while inserting the media');
    } finally {
      setLoading(false);
    }
  };

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
      'svg': 'image/svg+xml'
    };
    return mimeTypes[extension || ''] || 'application/octet-stream';
  };

  const handleClose = () => {
    // Reset form
    setInsertLocation('section');
    setSelectedSection('');
    setDisplayMode('figure');
    setCaption('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const isImage = mediaItem?.type === 'image';

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: '500px'
        }
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 2
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Insert Media
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 3 }}>
        {mediaItem && (
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              {isImage ? (
                <ImageIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              ) : (
                <DocumentIcon sx={{ fontSize: 40, color: 'primary.main' }} />
              )}
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {mediaItem.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {mediaItem.type.charAt(0).toUpperCase() + mediaItem.type.slice(1)}
                </Typography>
              </Box>
            </Box>
          </Box>
        )}

        <Divider sx={{ mb: 3 }} />

        <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
          <FormLabel component="legend" sx={{ mb: 2, fontWeight: 600 }}>
            Where to Insert
          </FormLabel>
          <RadioGroup
            value={insertLocation}
            onChange={(e) => setInsertLocation(e.target.value as 'section' | 'separate_page' | 'appendix')}
          >
            <FormControlLabel
              value="section"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    Insert in Section
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Add to an existing RFP section
                  </Typography>
                </Box>
              }
            />
            
            {insertLocation === 'section' && (
              <Box sx={{ ml: 4, mt: 1, mb: 2 }}>
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedSection}
                    onChange={(e) => setSelectedSection(e.target.value)}
                    displayEmpty
                    placeholder="Select section..."
                  >
                    <MenuItem value="" disabled>
                      <Typography color="text.secondary">Select section...</Typography>
                    </MenuItem>
                    {rfpSections.map((section) => (
                      <MenuItem key={section.id || section.name} value={section.id || section.name}>
                        {section.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            )}

            <FormControlLabel
              value="separate_page"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    Separate Page
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Media will have its own page in the RFP
                  </Typography>
                </Box>
              }
            />

            <FormControlLabel
              value="appendix"
              control={<Radio />}
              label={
                <Box>
                  <Typography variant="body1" fontWeight={500}>
                    Appendix
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Add to appendices section at the end
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Only show display options for images */}
        {isImage && (
          <>
            <Divider sx={{ mb: 3 }} />
            
            <FormControl component="fieldset" fullWidth sx={{ mb: 3 }}>
              <FormLabel component="legend" sx={{ mb: 2, fontWeight: 600 }}>
                How to Display
              </FormLabel>
              <RadioGroup
                value={displayMode}
                onChange={(e) => setDisplayMode(e.target.value as 'inline' | 'figure')}
              >
                <FormControlLabel
                  value="inline"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1" fontWeight={500}>
                        Inline
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Image appears directly within the text, flowing naturally with the content
                      </Typography>
                    </Box>
                  }
                />

                <FormControlLabel
                  value="figure"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body1" fontWeight={500}>
                        As Figure
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Professional numbered figure with caption (e.g., "Figure 1: Team Structure")
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {/* Caption field for figures */}
            {displayMode === 'figure' && (
              <>
                <Divider sx={{ mb: 3 }} />
                
                <FormControl fullWidth>
                  <FormLabel sx={{ mb: 1, fontWeight: 600 }}>
                    Caption
                  </FormLabel>
                  <TextField
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Enter figure caption..."
                    fullWidth
                    multiline
                    rows={2}
                    variant="outlined"
                    size="small"
                  />
                </FormControl>
              </>
            )}
          </>
        )}
        
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={handleClose} variant="outlined" disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleInsert}
          variant="contained"
          disabled={loading || (insertLocation === 'section' && !selectedSection)}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Inserting...' : 'Insert'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InsertMediaDialog;