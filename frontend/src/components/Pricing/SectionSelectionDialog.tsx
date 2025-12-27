import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  List,
  ListItem,
  IconButton,
  Alert,
  CircularProgress,
  TextField,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';

// Types
interface PricingSection {
  id: string;
  name: string;
  content?: string;
  isPricingRelated: boolean;
}

interface SectionSelectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedSections: string[], customSectionName?: string) => void;
  sections: PricingSection[];
  isLoading?: boolean;
  title?: string;
}

const SectionSelectionDialog: React.FC<SectionSelectionDialogProps> = ({
  open,
  onClose,
  onConfirm,
  sections,
  isLoading = false,
  title = "Select Sections or Create New Section for Pricing Table"
}) => {
  const theme = useTheme();
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [customSectionName, setCustomSectionName] = useState<string>('');

  const handleSectionToggle = (sectionId: string) => {
    setSelectedSections(prev => 
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleSelectAll = () => {
    const pricingRelatedSections = sections.filter(s => s.isPricingRelated);
    setSelectedSections(pricingRelatedSections.map(s => s.id));
  };

  const handleDeselectAll = () => {
    setSelectedSections([]);
  };

  const handleConfirm = () => {
    // Ensure either sections are selected OR custom name is provided
    const hasSelectedSections = selectedSections.length > 0;
    const hasCustomName = customSectionName.trim().length > 0;
    
    if (hasSelectedSections || hasCustomName) {
      onConfirm(selectedSections, customSectionName.trim() || undefined);
      setSelectedSections([]); // Reset for next time
      setCustomSectionName(''); // Reset for next time
    }
  };

  const handleClose = () => {
    setSelectedSections([]); // Reset when closing
    setCustomSectionName(''); // Reset when closing
    onClose();
  };

  // Validation: Either sections selected OR custom name provided
  const isConfirmDisabled = selectedSections.length === 0 && customSectionName.trim().length === 0;

  const pricingRelatedSections = sections.filter(s => s.isPricingRelated);
  const otherSections = sections.filter(s => !s.isPricingRelated);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      key={theme.palette.mode}
      PaperProps={{
        sx: {
          borderRadius: 3,
          maxHeight: '80vh',
          backgroundColor: theme.palette.background.paper,
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: `1px solid ${theme.palette.divider}`,
        pb: 2
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AssignmentIcon sx={{ color: theme.palette.text.secondary, fontSize: '1.25rem' }} />
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            {title}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography variant="body1" sx={{ mt:2, mb: 2, color: theme.palette.text.primary, lineHeight: 1.6 }}>
              Select existing sections to add the pricing table to, or provide a custom section name below.
              You must either select at least one section OR provide a custom section name.
            </Typography>

            {pricingRelatedSections.length === 0 ? (
              <Alert severity="info" sx={{ mb: 3 }}>
                No pricing or cost-related sections were found in your RFP. 
                A new "Pricing Table" section will be created when you proceed.
              </Alert>
            ) : (
              <>
                {/* Quick Actions */}
                <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                  <Button
                    size="small"
                    onClick={handleSelectAll}
                    sx={{ textTransform: 'none' }}
                  >
                    Select All Pricing Sections
                  </Button>
                  <Button
                    size="small"
                    onClick={handleDeselectAll}
                    sx={{ textTransform: 'none' }}
                  >
                    Clear Selection
                  </Button>
                </Box>

                {/* Pricing Related Sections */}
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" sx={{ 
                    mb: 2, 
                    fontWeight: 600, 
                    color: theme.palette.success.main,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                  }}>
                    <CheckCircleIcon sx={{ fontSize: '1rem' }} />
                    Pricing/Cost Related Sections ({pricingRelatedSections.length})
                  </Typography>
                  <List sx={{ 
                    border: `1px solid ${theme.palette.divider}`, 
                    borderRadius: 2, 
                    maxHeight: '200px', 
                    overflow: 'auto',
                    p: 0
                  }}>
                    {pricingRelatedSections.map((section, index) => (
                      <ListItem 
                        key={section.id}
                        sx={{ 
                          borderBottom: index < pricingRelatedSections.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
                          py: 1.5
                        }}
                      >
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedSections.includes(section.id)}
                              onChange={() => handleSectionToggle(section.id)}
                              sx={{ 
                                color: theme.palette.success.main,
                                '&.Mui-checked': {
                                  color: theme.palette.success.main,
                                }
                              }}
                            />
                          }
                          label={
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
                                {section.name}
                              </Typography>
                              {section.content && (
                                <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block' }}>
                                  {section.content.length > 100 
                                    ? `${section.content.substring(0, 100)}...` 
                                    : section.content
                                  }
                                </Typography>
                              )}
                            </Box>
                          }
                          sx={{ width: '100%', m: 0 }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </>
            )}

            {/* Other Sections */}
            {otherSections.length > 0 && (
              <Box>
                <Typography variant="subtitle2" sx={{ 
                  mb: 2, 
                  fontWeight: 600, 
                  color: theme.palette.text.secondary
                }}>
                  Other Sections ({otherSections.length})
                </Typography>
                <List sx={{ 
                  border: `1px solid ${theme.palette.divider}`, 
                  borderRadius: 2, 
                  maxHeight: '150px', 
                  overflow: 'auto',
                  p: 0
                }}>
                  {otherSections.map((section, index) => (
                    <ListItem 
                      key={section.id}
                      sx={{ 
                        borderBottom: index < otherSections.length - 1 ? `1px solid ${theme.palette.divider}` : 'none',
                        py: 1.5
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedSections.includes(section.id)}
                            onChange={() => handleSectionToggle(section.id)}
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.primary }}>
                              {section.name}
                            </Typography>
                            {section.content && (
                              <Typography variant="caption" sx={{ color: theme.palette.text.secondary, display: 'block' }}>
                                {section.content.length > 100 
                                  ? `${section.content.substring(0, 100)}...` 
                                  : section.content
                                }
                              </Typography>
                            )}
                          </Box>
                        }
                        sx={{ width: '100%', m: 0 }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {/* Custom Section Name Input */}
            <Box sx={{ mt: 3 }}>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle2" sx={{ 
                mb: 2, 
                fontWeight: 600, 
                color: theme.palette.text.primary
              }}>
                Custom Section Name (Optional)
              </Typography>
              <TextField
                fullWidth
                placeholder="Enter custom section name (e.g., 'Project Pricing', 'Cost Breakdown')"
                value={customSectionName}
                onChange={(e) => setCustomSectionName(e.target.value)}
                variant="outlined"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: 2,
                    backgroundColor: theme.palette.mode === 'light' ? '#F9FAFB' : '#2a2a2a',
                    '&:hover': {
                      backgroundColor: theme.palette.mode === 'light' ? '#F3F4F6' : '#3a3a3a'
                    },
                    '&.Mui-focused': {
                      backgroundColor: theme.palette.mode === 'light' ? '#FFFFFF' : '#1a1a1a'
                    }
                  }
                }}
                helperText={
                  selectedSections.length > 0
                    ? "If provided, this name will be used instead of default section names"
                    : "Required if no sections are selected above"
                }
              />
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        gap: 2,
        justifyContent: 'space-between'
      }}>
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontStyle: 'italic' }}>
          {selectedSections.length > 0 
            ? `${selectedSections.length} section(s) selected${customSectionName.trim() ? ` - Custom name: "${customSectionName.trim()}"` : ''}`
            : customSectionName.trim()
              ? `New section will be created - Name: "${customSectionName.trim()}"`
              : "Please select sections or provide a custom section name"
          }
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            onClick={handleClose}
            variant="outlined"
            disabled={isLoading}
            sx={{ 
              textTransform: 'none',
              fontWeight: 500,
              px: 4,
              py: 1,
              color: theme.palette.text.primary,
              borderColor: theme.palette.divider,
              '&:hover': {
                borderColor: theme.palette.text.secondary,
                backgroundColor: theme.palette.action.hover
              }
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            variant="contained"
            disabled={isLoading || isConfirmDisabled}
            sx={{ 
              textTransform: 'none',
              fontWeight: 500,
              px: 4,
              py: 1,
              backgroundColor: theme.palette.primary.main,
              '&:hover': {
                backgroundColor: theme.palette.primary.dark
              },
              '&:disabled': {
                backgroundColor: theme.palette.action.disabled,
                color: theme.palette.text.disabled
              }
            }}
          >
            Insert Pricing Table
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default SectionSelectionDialog;