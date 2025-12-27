import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Card,
  CardContent,
  InputAdornment,
  Radio,
  RadioGroup,
  FormControlLabel,
  Checkbox,
  FormGroup,
  useTheme,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Description as DocumentIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { rfpApi, SubscriptionRequiredError } from '../../services/api';

interface UsePastRFPDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (importData: any) => void;
  sessionId?: string;
  currentRfpName?: string;
}

interface PastRFP {
  id: string;
  name: string;
  sections: number;
  date: string;
}

interface RFPSection {
  id: string;
  name: string;
  content?: string;
  selected: boolean;
}

type DialogStep = 'list' | 'options' | 'sections';

const UsePastRFPDialog: React.FC<UsePastRFPDialogProps> = ({
  open,
  onClose,
  onImport,
  sessionId = '',
  currentRfpName = ''
}) => {
  const theme = useTheme();
  const [step, setStep] = useState<DialogStep>('list');
  const [selectedRFP, setSelectedRFP] = useState<PastRFP | null>(null);
  const [importOption, setImportOption] = useState<string>('structure');
  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<RFPSection[]>([]);
  const [pastRFPs, setPastRFPs] = useState<PastRFP[]>([]);
  const [loading, setLoading] = useState(false);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionError, setSubscriptionError] = useState(false);

  // Load past RFPs when dialog opens
  useEffect(() => {
    if (open) {
      loadPastRFPs();
    }
  }, [open]);

  const loadPastRFPs = async () => {
    setLoading(true);
    setError(null);
    setSubscriptionError(false);
    
    try {
      const response = await rfpApi.getPastRFPs(currentRfpName);
      if (response.success) {
        setPastRFPs(response.rfps);
      } else {
        setError(response.message || 'Failed to load past RFPs');
      }
    } catch (error: any) {
      console.error('Error loading past RFPs:', error);
      if (error instanceof SubscriptionRequiredError) {
        setSubscriptionError(true);
      } else {
        setError(error.message || 'Failed to load past RFPs');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRFPSections = async (rfpId: string) => {
    setSectionsLoading(true);
    setError(null);
    setSubscriptionError(false);
    
    try {
      const response = await rfpApi.getRFPSections(rfpId);
      if (response.success) {
        const sectionsWithSelection = response.sections.map(section => ({
          ...section,
          selected: false
        }));
        setSections(sectionsWithSelection);
      } else {
        setError(response.message || 'Failed to load RFP sections');
      }
    } catch (error: any) {
      console.error('Error loading RFP sections:', error);
      if (error instanceof SubscriptionRequiredError) {
        setSubscriptionError(true);
      } else {
        setError(error.message || 'Failed to load RFP sections');
      }
    } finally {
      setSectionsLoading(false);
    }
  };

  const filteredRFPs = pastRFPs.filter(rfp =>
    rfp.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRFPSelect = (rfp: PastRFP) => {
    setSelectedRFP(rfp);
    setImportOption('structure'); // Reset to default option
    setStep('options');
  };

  const handleImportOptionChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = event.target.value;
    setImportOption(option);
    
    if (option === 'sections' && selectedRFP) {
      setStep('sections');
      await loadRFPSections(selectedRFP.id);
    }
  };

  const handleImportOptionClick = async (option: string) => {
    setImportOption(option);
    
    if (option === 'sections' && selectedRFP) {
      setStep('sections');
      await loadRFPSections(selectedRFP.id);
    }
  };

  const handleSectionToggle = (sectionId: string) => {
    setSections(sections.map(section =>
      section.id === sectionId
        ? { ...section, selected: !section.selected }
        : section
    ));
  };

  const handleBack = () => {
    if (step === 'sections') {
      setStep('options');
    } else if (step === 'options') {
      setStep('list');
    }
  };

  const handleImport = async () => {
    if (!selectedRFP) return;
    
    setLoading(true);
    setError(null);
    setSubscriptionError(false);
    
    try {
      if (importOption === 'structure') {
        // Call match structure API
        const response = await rfpApi.matchStructure(
          selectedRFP.id, 
          sessionId, 
          selectedRFP.name,
          currentRfpName
        );
        
        if (response.success) {
          const importData = {
            type: 'structure',
            rfp: selectedRFP,
            matchedStructure: response.matchedStructure,
            createdSections: response.createdSections,
            sectionsUpdated: response.sectionsUpdated,
            sectionsAdded: response.sectionsAdded,
            message: response.message
          };
          onImport(importData);
        } else {
          setError(response.message || 'Failed to match structure');
          return;
        }
      } else if (importOption === 'sections') {
        // Import selected sections
        const selectedSections = sections.filter(s => s.selected);
        if (selectedSections.length === 0) {
          setError('Please select at least one section to import');
          return;
        }
        
        // Call the import sections API
        console.log('🔍 Debug import request:', {
          currentRfpNameProp: currentRfpName,
          sessionId: sessionId,
          selectedRFPName: selectedRFP.name
        });
        
        if (!currentRfpName || currentRfpName.trim() === '') {
          setError('Current RFP name is required but not provided. Please ensure you have a valid RFP loaded.');
          return;
        }
        
        const importRequest = {
          sessionId,
          rfpName: selectedRFP.name,
          currentRfpName: currentRfpName.trim(),
          selectedSections: selectedSections.map(section => ({
            id: section.id,
            name: section.name
          }))
        };
        
        const response = await rfpApi.importSelectedSections(importRequest);
        
        if (response.success) {
          const importData = {
            type: 'sections',
            rfp: selectedRFP,
            selectedSections: selectedSections,
            updatedSections: response.updatedSections,
            operation: response.operation,
            message: response.message
          };
          onImport(importData);
        } else {
          setError(response.message || 'Failed to import sections');
          return;
        }
      }
      
      handleClose();
    } catch (error: any) {
      console.error('Error during import:', error);
      if (error instanceof SubscriptionRequiredError) {
        setSubscriptionError(true);
      } else {
        setError(error.message || 'Failed to import from past RFP');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setStep('list');
    setSelectedRFP(null);
    setImportOption('structure');
    setSections([]);
    setSearchQuery('');
    setError(null);
    setSubscriptionError(false);
  };

  const renderListView = () => (
    <>
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: 'none',
        pb: 1
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 0, pb: 2 }}>
        {/* Error Display */}
        {(error || subscriptionError) && (
          <Alert 
            severity={subscriptionError ? "warning" : "error"} 
            sx={{ mb: 3 }}
            onClose={() => {
              setError(null);
              setSubscriptionError(false);
            }}
          >
            {subscriptionError 
              ? "Subscription required to access past RFPs. Please upgrade your plan."
              : error
            }
          </Alert>
        )}

        {/* Search Field */}
        <TextField
          fullWidth
          placeholder="Search past submissions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={loading || subscriptionError}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: '1.2rem' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: theme.palette.divider,
                borderRadius: 1.5
              },
              '& input': {
                py: 1.5,
                color: theme.palette.text.primary,
                fontSize: '0.95rem'
              },
              '&:hover fieldset': {
                borderColor: theme.palette.text.secondary
              },
              '&.Mui-focused fieldset': {
                borderColor: theme.palette.primary.main
              }
            }
          }}
        />

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
            <CircularProgress size={40} />
            <Typography variant="body2" sx={{ ml: 2, color: theme.palette.text.secondary }}>
              Loading past RFPs...
            </Typography>
          </Box>
        )}

        {/* RFP List */}
        {!loading && !subscriptionError && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filteredRFPs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
                  {pastRFPs.length === 0 ? 'No past RFPs found' : 'No RFPs match your search'}
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  {pastRFPs.length === 0 
                    ? 'Complete your first RFP to see it listed here' 
                    : 'Try adjusting your search terms'
                  }
                </Typography>
              </Box>
            ) : (
              filteredRFPs.map((rfp) => (
                <Card
                  key={rfp.id}
                  onClick={() => handleRFPSelect(rfp)}
                  sx={{
                    cursor: 'pointer',
                    border: `1px solid ${theme.palette.divider}`,
                    borderRadius: 2,
                    boxShadow: 'none',
                    backgroundColor: theme.palette.background.paper,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      backgroundColor: theme.palette.action.hover,
                      borderColor: theme.palette.text.secondary,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }
                  }}
                >
                  <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5, px: 3 }}>
                    <DocumentIcon sx={{ color: theme.palette.primary.main, fontSize: '1.5rem' }} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.primary, fontSize: '1rem' }}>
                        {rfp.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: theme.palette.text.secondary, mt: 0.5 }}>
                        {rfp.sections} sections • {rfp.date}
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              ))
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        justifyContent: 'flex-end',
        gap: 2
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider,
            px: 4,
            py: 1,
            '&:hover': {
              borderColor: theme.palette.text.secondary,
              backgroundColor: theme.palette.action.hover
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={!selectedRFP || loading || subscriptionError}
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            px: 4,
            py: 1,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark
            },
            '&:disabled': {
              backgroundColor: theme.palette.action.disabled,
              color: theme.palette.action.disabled
            }
          }}
          startIcon={<CheckIcon />}
        >
          Import
        </Button>
      </DialogActions>
    </>
  );

  const renderOptionsView = () => (
    <>
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: 'none',
        pb: 1
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Error Display */}
        {(error || subscriptionError) && (
          <Alert 
            severity={subscriptionError ? "warning" : "error"} 
            sx={{ mb: 3 }}
            onClose={() => {
              setError(null);
              setSubscriptionError(false);
            }}
          >
            {subscriptionError 
              ? "Subscription required to import from past RFPs. Please upgrade your plan."
              : error
            }
          </Alert>
        )}

        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          p: 2.5,
          backgroundColor: theme.palette.action.hover,
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`
        }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {selectedRFP?.name}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {selectedRFP?.sections} sections • {selectedRFP?.date}
            </Typography>
          </Box>
          <Button
            onClick={() => setStep('list')}
            variant="text"
            sx={{ textTransform: 'none', color: theme.palette.primary.main }}
          >
            Change
          </Button>
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 3 }}>
          Import Options
        </Typography>

        <RadioGroup
          value={importOption}
          onChange={handleImportOptionChange}
          sx={{ gap: 2 }}
        >
          <Card
            sx={{
              border: importOption === 'structure' ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
              backgroundColor: importOption === 'structure' ? theme.palette.action.selected : theme.palette.background.paper,
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: importOption === 'structure' ? theme.palette.primary.main : theme.palette.text.secondary
              }
            }}
            onClick={() => handleImportOptionClick('structure')}
          >
            <CardContent sx={{ py: 3, px: 3 }}>
              <FormControlLabel
                value="structure"
                control={<Radio sx={{ color: theme.palette.primary.main, mr: 2 }} />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 0.5 }}>
                      Match Structure & Tone
                    </Typography>
                    <Typography variant="body2" sx={{ color: theme.palette.text.secondary, lineHeight: 1.4 }}>
                      Apply the same template structure and writing style to your new RFP
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, alignItems: 'flex-start' }}
              />
            </CardContent>
          </Card>

          <Card
            sx={{
              border: importOption === 'sections' ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
              backgroundColor: importOption === 'sections' ? theme.palette.action.selected : theme.palette.background.paper,
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: importOption === 'sections' ? theme.palette.primary.main : theme.palette.text.secondary
              }
            }}
            onClick={() => handleImportOptionClick('sections')}
          >
            <CardContent sx={{ py: 3, px: 3 }}>
              <FormControlLabel
                value="sections"
                control={<Radio sx={{ color: theme.palette.primary.main, mr: 2 }} />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 0.5 }}>
                      Import Selected Sections
                    </Typography>
                    <Typography variant="body2" sx={{ color: theme.palette.text.secondary, lineHeight: 1.4 }}>
                      Choose specific sections to copy into your new RFP
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, alignItems: 'flex-start' }}
              />
            </CardContent>
          </Card>
        </RadioGroup>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        justifyContent: 'space-between'
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: theme.palette.text.secondary,
            borderColor: theme.palette.divider
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={loading || subscriptionError}
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark
            },
            '&:disabled': {
              backgroundColor: theme.palette.action.disabled,
              color: theme.palette.action.disabled
            }
          }}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckIcon />}
        >
          {loading ? 'Processing...' : 'Import'}
        </Button>
      </DialogActions>
    </>
  );

  const renderSectionsView = () => (
    <>
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: 'none',
        pb: 1
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: theme.palette.text.secondary }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Error Display */}
        {(error || subscriptionError) && (
          <Alert 
            severity={subscriptionError ? "warning" : "error"} 
            sx={{ mb: 3 }}
            onClose={() => {
              setError(null);
              setSubscriptionError(false);
            }}
          >
            {subscriptionError 
              ? "Subscription required to access RFP sections. Please upgrade your plan."
              : error
            }
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
              {selectedRFP?.name}
            </Typography>
            <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
              {selectedRFP?.sections} sections • {selectedRFP?.date}
            </Typography>
          </Box>
          <Button
            onClick={() => setStep('list')}
            variant="text"
            sx={{ textTransform: 'none', color: theme.palette.primary.main }}
          >
            Change
          </Button>
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary, mb: 3 }}>
          Import Options
        </Typography>

        <Card
          sx={{
            border: `2px solid ${theme.palette.primary.main}`,
            backgroundColor: theme.palette.action.selected,
            mb: 3,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Radio checked sx={{ color: theme.palette.primary.main }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: theme.palette.text.primary }}>
                  Import Selected Sections
                </Typography>
                <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
                  Choose specific sections to copy into your new RFP
                </Typography>
              </Box>
            </Box>

            {/* Loading State for Sections */}
            {sectionsLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 3, ml: 4 }}>
                <CircularProgress size={24} />
                <Typography variant="body2" sx={{ ml: 2, color: theme.palette.text.secondary }}>
                  Loading sections...
                </Typography>
              </Box>
            )}

            {/* Sections List */}
            {!sectionsLoading && !subscriptionError && (
              <Box sx={{ mt: 3, ml: 4 }}>
                {sections.length === 0 ? (
                  <Typography variant="body2" sx={{ color: theme.palette.text.secondary, py: 2 }}>
                    No sections available for this RFP.
                  </Typography>
                ) : (
                  <FormGroup>
                    {sections.map((section) => (
                      <FormControlLabel
                        key={section.id}
                        control={
                          <Checkbox
                            checked={section.selected}
                            onChange={() => handleSectionToggle(section.id)}
                            sx={{ color: theme.palette.primary.main }}
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                            <Box sx={{ flexGrow: 1 }}>
                              <Typography variant="body1" sx={{ color: theme.palette.text.primary, fontWeight: 500 }}>
                                {section.name}
                              </Typography>
                            </Box>
                          </Box>
                        }
                        sx={{ 
                          width: '100%', 
                          m: 0,
                          py: 1,
                          px: 1,
                          borderRadius: 1,
                          '&:hover': {
                            backgroundColor: theme.palette.action.hover
                          },
                          '& .MuiFormControlLabel-label': {
                            width: '100%'
                          }
                        }}
                      />
                    ))}
                  </FormGroup>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: `1px solid ${theme.palette.divider}`,
        justifyContent: 'space-between'
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: theme.palette.text.primary,
            borderColor: theme.palette.divider
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={loading || sectionsLoading || subscriptionError || sections.filter(s => s.selected).length === 0}
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              backgroundColor: theme.palette.primary.dark
            },
            '&:disabled': {
              backgroundColor: theme.palette.action.disabled,
              color: theme.palette.action.disabled
            }
          }}
          startIcon={loading ? <CircularProgress size={16} /> : <CheckIcon />}
        >
          {loading ? 'Importing...' : `Import ${sections.filter(s => s.selected).length} Section${sections.filter(s => s.selected).length !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </>
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          minHeight: '600px',
          maxHeight: '700px'
        }
      }}
    >
      {step === 'list' && renderListView()}
      {step === 'options' && renderOptionsView()}
      {step === 'sections' && renderSectionsView()}
    </Dialog>
  );
};

export default UsePastRFPDialog;