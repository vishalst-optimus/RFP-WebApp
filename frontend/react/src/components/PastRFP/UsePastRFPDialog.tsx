import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Description as DocumentIcon,
  Check as CheckIcon,
} from '@mui/icons-material';

interface UsePastRFPDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (importData: any) => void;
}

interface RFPSubmission {
  id: string;
  title: string;
  sections: number;
  date: string;
}

interface RFPSection {
  id: string;
  name: string;
  confidence: string;
  selected: boolean;
}

const MOCK_SUBMISSIONS: RFPSubmission[] = [
  { id: '1', title: 'Downtown Office Complex Security', sections: 8, date: 'Oct 25, 2024' },
  { id: '2', title: 'Hospital Security Services RFP', sections: 6, date: 'Sep 15, 2024' },
  { id: '3', title: 'Retail Mall Security Proposal', sections: 7, date: 'Aug 30, 2024' },
  { id: '4', title: 'University Campus Security', sections: 9, date: 'Jul 18, 2024' },
  { id: '5', title: 'Corporate Headquarters Security', sections: 5, date: 'Jun 10, 2024' },
];

const MOCK_SECTIONS: RFPSection[] = [
  { id: '1', name: 'Executive Summary', confidence: '95% confidence', selected: false },
  { id: '2', name: 'Company Background', confidence: '92% confidence', selected: false },
  { id: '3', name: 'Proposed Security Solution', confidence: '90% confidence', selected: false },
  { id: '4', name: 'Staffing Plan', confidence: '88% confidence', selected: false },
  { id: '5', name: 'Technology & Equipment', confidence: '93% confidence', selected: false },
  { id: '6', name: 'Pricing Structure', confidence: '96% confidence', selected: false },
  { id: '7', name: 'Implementation Timeline', confidence: '91% confidence', selected: false },
];

type DialogStep = 'list' | 'options' | 'sections';

const UsePastRFPDialog: React.FC<UsePastRFPDialogProps> = ({
  open,
  onClose,
  onImport
}) => {
  const [step, setStep] = useState<DialogStep>('list');
  const [selectedSubmission, setSelectedSubmission] = useState<RFPSubmission | null>(null);
  const [importOption, setImportOption] = useState<string>('structure');
  const [searchQuery, setSearchQuery] = useState('');
  const [sections, setSections] = useState<RFPSection[]>(MOCK_SECTIONS);

  const filteredSubmissions = MOCK_SUBMISSIONS.filter(submission =>
    submission.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmissionSelect = (submission: RFPSubmission) => {
    setSelectedSubmission(submission);
    setStep('options');
  };

  const handleImportOptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setImportOption(event.target.value);
    if (event.target.value === 'sections') {
      setStep('sections');
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

  const handleImport = () => {
    const importData = {
      submission: selectedSubmission,
      option: importOption,
      selectedSections: step === 'sections' ? sections.filter(s => s.selected) : null
    };
    onImport(importData);
    onClose();
    // Reset state
    setStep('list');
    setSelectedSubmission(null);
    setImportOption('structure');
    setSections(MOCK_SECTIONS);
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setStep('list');
    setSelectedSubmission(null);
    setImportOption('structure');
    setSections(MOCK_SECTIONS);
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
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937' }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ px: 3, pt: 0, pb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search past submissions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: '#CBD5E0', fontSize: '1.2rem' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            mb: 3,
            '& .MuiOutlinedInput-root': {
              '& fieldset': {
                borderColor: '#E2E8F0',
                borderRadius: 1.5
              },
              '& input': {
                py: 1.5,
                color: '#2D3748',
                fontSize: '0.95rem'
              },
              '&:hover fieldset': {
                borderColor: '#CBD5E0'
              },
              '&.Mui-focused fieldset': {
                borderColor: '#4299E1'
              }
            }
          }}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredSubmissions.map((submission) => (
            <Card
              key={submission.id}
              onClick={() => handleSubmissionSelect(submission)}
              sx={{
                cursor: 'pointer',
                border: '1px solid #E2E8F0',
                borderRadius: 2,
                boxShadow: 'none',
                transition: 'all 0.2s ease',
                '&:hover': {
                  backgroundColor: '#F7FAFC',
                  borderColor: '#CBD5E0',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }
              }}
            >
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5, px: 3 }}>
                <DocumentIcon sx={{ color: '#4299E1', fontSize: '1.5rem' }} />
                <Typography variant="body1" sx={{ fontWeight: 500, color: '#2D3748', fontSize: '1rem' }}>
                  {submission.title}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #E2E8F0',
        justifyContent: 'flex-end',
        gap: 2
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: '#4A5568',
            borderColor: '#E2E8F0',
            px: 4,
            py: 1,
            '&:hover': {
              borderColor: '#CBD5E0',
              backgroundColor: '#F7FAFC'
            }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          disabled={!selectedSubmission}
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: '#4299E1',
            px: 4,
            py: 1,
            '&:hover': {
              backgroundColor: '#3182CE'
            },
            '&:disabled': {
              backgroundColor: '#E2E8F0',
              color: '#A0AEC0'
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
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937' }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          p: 2.5,
          backgroundColor: '#F7FAFC',
          borderRadius: 2,
          border: '1px solid #E2E8F0'
        }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C' }}>
              {selectedSubmission?.title}
            </Typography>
            <Typography variant="body2" sx={{ color: '#718096' }}>
              {selectedSubmission?.sections} sections • {selectedSubmission?.date}
            </Typography>
          </Box>
          <Button
            onClick={() => setStep('list')}
            variant="text"
            sx={{ textTransform: 'none', color: '#4299E1' }}
          >
            Change
          </Button>
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 600, color: '#374151', mb: 3 }}>
          Import Options
        </Typography>

        <RadioGroup
          value={importOption}
          onChange={handleImportOptionChange}
          sx={{ gap: 2 }}
        >
          <Card
            sx={{
              border: importOption === 'structure' ? '2px solid #4299E1' : '1px solid #E2E8F0',
              backgroundColor: importOption === 'structure' ? '#EBF8FF' : 'white',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: importOption === 'structure' ? '#4299E1' : '#CBD5E0'
              }
            }}
            onClick={() => setImportOption('structure')}
          >
            <CardContent sx={{ py: 3, px: 3 }}>
              <FormControlLabel
                value="structure"
                control={<Radio sx={{ color: '#4299E1', mr: 2 }} />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#1A202C', mb: 0.5 }}>
                      Match Structure & Tone
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#718096', lineHeight: 1.4 }}>
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
              border: importOption === 'sections' ? '2px solid #4299E1' : '1px solid #E2E8F0',
              backgroundColor: importOption === 'sections' ? '#EBF8FF' : 'white',
              cursor: 'pointer',
              borderRadius: 2,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: importOption === 'sections' ? '#4299E1' : '#CBD5E0'
              }
            }}
            onClick={() => setImportOption('sections')}
          >
            <CardContent sx={{ py: 3, px: 3 }}>
              <FormControlLabel
                value="sections"
                control={<Radio sx={{ color: '#4299E1', mr: 2 }} />}
                label={
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600, color: '#1A202C', mb: 0.5 }}>
                      Import Selected Sections
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#718096', lineHeight: 1.4 }}>
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
        borderTop: '1px solid #E2E8F0',
        justifyContent: 'space-between'
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: '#718096',
            borderColor: '#E2E8F0'
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: '#4299E1',
            '&:hover': {
              backgroundColor: '#3182CE'
            }
          }}
          startIcon={<CheckIcon />}
        >
          Import
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
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1F2937' }}>
            Use Prior Submission
          </Typography>
          <Typography variant="body2" sx={{ color: '#6B7280', mt: 0.5 }}>
            Import structure, tone, or specific sections from your past winning submissions
          </Typography>
        </Box>
        <IconButton onClick={handleClose} sx={{ color: '#9CA3AF' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600, color: '#374151' }}>
              {selectedSubmission?.title}
            </Typography>
            <Typography variant="body2" sx={{ color: '#6B7280' }}>
              {selectedSubmission?.sections} sections • {selectedSubmission?.date}
            </Typography>
          </Box>
          <Button
            onClick={() => setStep('list')}
            variant="text"
            sx={{ textTransform: 'none', color: '#3B82F6' }}
          >
            Change
          </Button>
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 600, color: '#374151', mb: 3 }}>
          Import Options
        </Typography>

        <Card
          sx={{
            border: '2px solid #4299E1',
            backgroundColor: '#E6FFFA',
            mb: 3,
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <CardContent sx={{ py: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Radio checked sx={{ color: '#4299E1' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1A202C' }}>
                  Import Selected Sections
                </Typography>
                <Typography variant="body2" sx={{ color: '#718096' }}>
                  Choose specific sections to copy into your new RFP
                </Typography>
              </Box>
            </Box>

            <Box sx={{ mt: 3, ml: 4 }}>
              <FormGroup>
                {sections.map((section) => (
                  <FormControlLabel
                    key={section.id}
                    control={
                      <Checkbox
                        checked={section.selected}
                        onChange={() => handleSectionToggle(section.id)}
                        sx={{ color: '#4299E1' }}
                      />
                    }
                    label={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <Typography variant="body1" sx={{ color: '#1A202C' }}>
                          {section.name}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#718096', ml: 2 }}>
                          ({section.confidence})
                        </Typography>
                      </Box>
                    }
                    sx={{ 
                      width: '100%', 
                      m: 0,
                      py: 0.5,
                      '& .MuiFormControlLabel-label': {
                        width: '100%'
                      }
                    }}
                  />
                ))}
              </FormGroup>
            </Box>
          </CardContent>
        </Card>
      </DialogContent>

      <DialogActions sx={{ 
        p: 3, 
        borderTop: '1px solid #E5E7EB',
        justifyContent: 'space-between'
      }}>
        <Button
          onClick={handleClose}
          variant="outlined"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            color: '#374151',
            borderColor: '#D1D5DB'
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          variant="contained"
          sx={{ 
            textTransform: 'none',
            fontWeight: 500,
            backgroundColor: '#3B82F6',
            '&:hover': {
              backgroundColor: '#2563EB'
            }
          }}
          startIcon={<CheckIcon />}
        >
          Import
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