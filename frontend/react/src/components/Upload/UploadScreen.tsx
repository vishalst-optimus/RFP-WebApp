import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Tab,
  Tabs,
  Paper,
  styled,
} from '@mui/material';
import { Upload as UploadIcon, InsertDriveFile as FileIcon, Link as LinkIcon } from '@mui/icons-material';

const DropZone = styled(Paper)(({ theme }) => ({
  border: `2px dashed ${theme.palette.primary.main}`,
  borderRadius: 8,
  padding: theme.spacing(6),
  textAlign: 'center',
  backgroundColor: '#F0F8FF',
  cursor: 'pointer',
  transition: 'all 0.3s ease',
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

const IllustrationBox = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: 400,
  height: 200,
  backgroundColor: '#87CEEB',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 32px auto',
  position: 'relative',
  overflow: 'hidden',
  [theme.breakpoints.up('sm')]: {
    height: 250,
    maxWidth: 400,
  },
  [theme.breakpoints.down('sm')]: {
    height: 180,
    margin: '0 auto 24px auto',
  },
}));

interface UploadScreenProps {
  onFileUpload: (file: File, projectName: string) => void;
  isLoading?: boolean;
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onFileUpload, isLoading = false }) => {
  const [projectName, setProjectName] = useState('');
  const [selectedTab, setSelectedTab] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [referenceLinks, setReferenceLinks] = useState('');

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const validFile = files.find(file => 
      ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
        .includes(file.type)
    );
    
    if (validFile) {
      setSelectedFile(validFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log('File selected:', file);
    if (file) {
      setSelectedFile(file);
      console.log('Selected file set:', file.name);
    }
  };

  const handleSubmit = () => {
    console.log('Submit clicked. File:', selectedFile, 'Project:', projectName);
    if (selectedFile && projectName.trim()) {
      onFileUpload(selectedFile, projectName.trim());
    }
  };

  const mainFileCount = selectedFile ? 1 : 0;
  const supportingFileCount = 0;

  // Debug the button state
  console.log('Button disabled?', !selectedFile || !projectName.trim() || isLoading, {
    selectedFile: !!selectedFile,
    projectName: projectName.trim(),
    isLoading
  });

  return (
    <Box sx={{ 
      maxWidth: 800, 
      mx: 'auto', 
      p: { xs: 2, sm: 3, md: 4 },
      width: '100%'
    }}>
      {/* Illustration */}
      <IllustrationBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* PDF Icon */}
          <Box
            sx={{
              width: 60,
              height: 80,
              backgroundColor: 'white',
              borderRadius: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            }}
          >
            <FileIcon sx={{ fontSize: 32, color: '#D32F2F' }} />
            <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>
              PDF
            </Typography>
          </Box>

          {/* Arrow */}
          <Box sx={{ fontSize: 24, color: 'white', mx: 2 }}>→</Box>

          {/* Output Icons */}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Box
              sx={{
                width: 40,
                height: 50,
                backgroundColor: 'white',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <FileIcon sx={{ fontSize: 20, color: '#4CAF50' }} />
            </Box>
            <Box
              sx={{
                width: 40,
                height: 50,
                backgroundColor: 'white',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              <FileIcon sx={{ fontSize: 20, color: '#2196F3' }} />
            </Box>
          </Box>
        </Box>
      </IllustrationBox>

      {/* Title */}
      <Typography 
        variant="h3" 
        align="center" 
        sx={{ 
          mb: 2, 
          fontWeight: 700,
          fontSize: { xs: '1.75rem', sm: '2.125rem', md: '3rem' },
          px: { xs: 1, sm: 0 }
        }}
      >
Upload Your RFP Documents
      </Typography>
      <Typography 
        variant="body1" 
        align="center" 
        sx={{ 
          mb: 4, 
          color: 'text.secondary',
          fontSize: { xs: '0.875rem', sm: '1rem' },
          px: { xs: 1, sm: 0 }
        }}
      >
        Upload your RFP document along with any supporting materials. Our Agent will analyze
        the requirements and generate intelligent responses.
      </Typography>

      {/* Project Name */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>
            RFP Name
          </Typography>
          <TextField
            fullWidth
            placeholder="Enter your RFP name..."
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            helperText="This will help organize your RFP responses"
          />
        </CardContent>
      </Card>

      {/* File Upload Tabs */}
      <Card>
        <Tabs
          value={selectedTab}
          onChange={(_, newValue) => setSelectedTab(newValue)}
          sx={{ 
            borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
            '& .MuiTab-root': {
              minHeight: { xs: 64, sm: 48 },
              fontSize: { xs: '0.75rem', sm: '0.875rem' }
            }
          }}
          variant={window?.innerWidth < 600 ? "scrollable" : "standard"}
          scrollButtons="auto"
        >
          <Tab 
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                <Typography sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                  {window?.innerWidth < 600 ? 'Main Documents' : 'Main RFP Documents'}
                </Typography>
                {mainFileCount > 0 && (
                  <Box sx={{ 
                    backgroundColor: 'primary.main', 
                    color: 'white', 
                    borderRadius: '50%', 
                    width: { xs: 16, sm: 20 }, 
                    height: { xs: 16, sm: 20 }, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: { xs: '0.625rem', sm: '0.75rem' }
                  }}>
                    {mainFileCount}
                  </Box>
                )}
              </Box>
            } 
          />
          <Tab 
            disabled
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
                <Typography sx={{ 
                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                  color: 'text.disabled',
                  position: 'relative'
                }}>
                  {window?.innerWidth < 600 ? 'Supporting Docs' : 'Supporting Documents & Links'}
                  <Typography
                    component="span"
                    sx={{
                      ml: 1,
                      fontSize: '0.65rem',
                      color: 'white',
                      fontWeight: 600,
                      backgroundColor: 'warning.main',
                      px: 0.5,
                      py: 0.25,
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(255, 152, 0, 0.3)'
                    }}
                  >
                    COMING SOON
                  </Typography>
                </Typography>
                {supportingFileCount > 0 && (
                  <Box sx={{ 
                    backgroundColor: 'text.disabled', 
                    color: 'white', 
                    borderRadius: '50%', 
                    width: { xs: 16, sm: 20 }, 
                    height: { xs: 16, sm: 20 }, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: { xs: '0.625rem', sm: '0.75rem' }
                  }}>
                    {supportingFileCount}
                  </Box>
                )}
              </Box>
            } 
          />
        </Tabs>

        <CardContent>
          {selectedTab === 0 && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                Upload the primary RFP document that needs responses. This is typically the main RFP file with requirements and questions.
              </Typography>
              
              <DropZone
                className={dragOver ? 'dragover' : ''}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
              >
                <FileIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {selectedFile ? selectedFile.name : 'Drop main RFP files here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  PDF/Word files (max 50MB each)
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  sx={{ mt: 1 }}
                >
                  Select Main RFP Files
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </Button>
              </DropZone>
            </Box>
          )}

          {selectedTab === 1 && (
            <Box sx={{
              position: 'relative',
              filter: 'blur(1px)',
              opacity: 0.6,
              pointerEvents: 'none',
              userSelect: 'none'
            }}>
              <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
                Add any supporting documents, company information, or reference materials that might help in generating better responses.
              </Typography>
              
              {/* Reference Links Section */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinkIcon sx={{ color: 'primary.main' }} />
                  Reference Links
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  placeholder="Paste reference links here (one per line)&#10;https://company-website.com&#10;https://previous-project-docs.com&#10;https://industry-standards.org"
                  value={referenceLinks}
                  onChange={(e) => setReferenceLinks(e.target.value)}
                  disabled
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#f5f5f5'
                    }
                  }}
                />
              </Box>

              <DropZone sx={{ cursor: 'not-allowed' }}>
                <UploadIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1, color: 'text.disabled' }}>
                  Drop supporting files here
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                  Optional supporting materials (PDF, Word, Excel)
                </Typography>
                <Button
                  variant="outlined"
                  disabled
                  sx={{ mt: 1 }}
                >
                  Select Files
                </Button>
              </DropZone>
              
              {/* Coming Soon Overlay */}
              <Box sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '2px solid',
                borderColor: 'primary.main',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                zIndex: 10,
                pointerEvents: 'none'
              }}>
                <Typography variant="h6" sx={{ color: 'primary.main', fontWeight: 700, mb: 1 }}>
                  🚀 Coming Soon!
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 280 }}>
                  Supporting documents and reference links will be available in future updates to enhance RFP responses.
                </Typography>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Start Analysis Button */}
      <Box sx={{ 
        mt: 4, 
        textAlign: 'center',
        px: { xs: 1, sm: 0 }
      }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSubmit}
          disabled={!selectedFile || !projectName.trim() || isLoading}
          sx={{ 
            minWidth: { xs: 'auto', sm: 300 },
            width: { xs: '100%', sm: 'auto' },
            height: 50,
            fontSize: { xs: '1rem', sm: '1.1rem' },
            fontWeight: 600,
          }}
        >
          {isLoading ? 'Analyzing...' : (
            window?.innerWidth < 600 
              ? `Start Analysis (${mainFileCount + supportingFileCount} files)`
              : `Start Analysis (${mainFileCount} main + ${supportingFileCount} supporting items)`
          )}
        </Button>
      </Box>
    </Box>
  );
};

export default UploadScreen;