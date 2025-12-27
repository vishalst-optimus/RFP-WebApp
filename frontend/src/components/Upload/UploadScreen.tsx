import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Paper,
  styled,
  Chip,
  Grid,
  Tabs,
  Tab,
  useTheme,
} from '@mui/material';
import { 
  InsertDriveFile as FileIcon,
  Link as LinkIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import type { UploadedFile } from '../../types/index';
import UploadedFilesList from './UploadedFilesList';

const IllustrationBox = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: 300,
  height: 160,
  backgroundColor: theme.palette.primary.light,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 24px auto',
  position: 'relative',
  overflow: 'hidden',
  [theme.breakpoints.up('sm')]: {
    height: 180,
    maxWidth: 320,
  },
  [theme.breakpoints.down('sm')]: {
    height: 140,
    margin: '0 auto 16px auto',
  },
}));

interface UploadScreenProps {
  onFileUpload: (files: File[], projectName: string) => void;
  isLoading?: boolean;
}

const UploadScreen: React.FC<UploadScreenProps> = ({ onFileUpload, isLoading = false }) => {
  const theme = useTheme();
  const [projectName, setProjectName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [activeTab, setActiveTab] = useState(0);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    // If we already have a file, don't allow dropping more
    if (uploadedFiles.length > 0) {
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => 
      ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain']
        .includes(file.type)
    );
    
    // Only take the first valid file
    if (validFiles.length > 0) {
      const firstFile = validFiles[0];
      const newFile: UploadedFile = {
        id: `${Date.now()}`,
        file: firstFile,
        name: firstFile.name,
        size: firstFile.size,
        type: firstFile.type,
        status: 'primary' as const,
        fileUrl: URL.createObjectURL(firstFile), // Create object URL for preview
      };
      setUploadedFiles([newFile]); // Replace any existing file
    }
  }, [uploadedFiles.length]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log('Files selected:', files);
    if (files && files.length > 0) {
      // Only take the first file
      const firstFile = files[0];
      const newFile: UploadedFile = {
        id: `${Date.now()}`,
        file: firstFile,
        name: firstFile.name,
        size: firstFile.size,
        type: firstFile.type,
        status: 'primary' as const,
        fileUrl: URL.createObjectURL(firstFile), // Create object URL for preview
      };
      setUploadedFiles([newFile]); // Replace any existing file
    }
    // Reset the input value so the same file can be selected again if needed
    e.target.value = '';
  };

  const handleRemoveFile = (fileId: string) => {
    const fileToRemove = uploadedFiles.find(file => file.id === fileId);
    if (fileToRemove?.fileUrl) {
      URL.revokeObjectURL(fileToRemove.fileUrl); // Clean up object URL
    }
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
  };

  const handleSubmit = () => {
    if (uploadedFiles.length > 0 && projectName.trim()) {
      const files = uploadedFiles.map(uploadedFile => uploadedFile.file);
      onFileUpload(files, projectName);
    }
  };

  const mainFileCount = uploadedFiles.length;

  return (
    <Box sx={{ 
      maxWidth: 800, 
      mx: 'auto', 
      py: { xs: 3, sm: 4, md: 6 },
      textAlign: 'center',
      px: { xs: 2, sm: 3 }
    }}>
      {/* Illustration */}
      <IllustrationBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* PDF Icon */}
          <Box
            sx={{
              width: 60,
              height: 80,
              backgroundColor: theme => theme.palette.background.paper,
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 2,
            }}
          >
            <FileIcon sx={{ fontSize: 32, color: 'error.main' }} />
            <Typography variant="caption" sx={{ mt: 1, fontWeight: 600 }}>
              PDF
            </Typography>
          </Box>

          {/* Arrow */}
          <Box sx={{ fontSize: 28, color: 'white', mx: 3 }}>→</Box>

          {/* Output Icons */}
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box
              sx={{
                width: 40,
                height: 50,
                backgroundColor: theme => theme.palette.background.paper,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 1,
              }}
            >
              <FileIcon sx={{ fontSize: 20, color: 'success.main' }} />
            </Box>
            <Box
              sx={{
                width: 40,
                height: 50,
                backgroundColor: theme => theme.palette.background.paper,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 1,
              }}
            >
              <FileIcon sx={{ fontSize: 20, color: 'primary.main' }} />
            </Box>
          </Box>
        </Box>
      </IllustrationBox>

      {/* Title */}
      <Box sx={{ mb: 4 }}>
        <Typography 
          variant="h3" 
          align="center" 
          sx={{ 
            mb: 2, 
            fontWeight: 700,
            fontSize: { xs: '1.75rem', sm: '2rem', md: '2.25rem' },
            background: (theme) => `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
            backgroundClip: 'text',
            textFillColor: 'transparent',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Upload Your RFP Documents
        </Typography>
        <Typography 
          variant="body1" 
          align="center" 
          sx={{ 
            color: 'text.secondary',
            fontWeight: 400,
            maxWidth: '500px',
            mx: 'auto',
            lineHeight: 1.5,
            fontSize: { xs: '0.95rem', sm: '1rem' }
          }}
        >
          Upload your RFP document along with any supporting materials. Our AI agent will analyze
          the requirements and generate intelligent responses.
        </Typography>
      </Box>

      {/* Project Name */}
      <Card sx={{ mb: 3, textAlign: 'left' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            RFP Name
          </Typography>
          <TextField
            fullWidth
            placeholder="Enter your RFP name..."
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            helperText="This will help organize your RFP responses"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: 'background.paper',
              },
            }}
          />
        </CardContent>
      </Card>

      {/* File Upload Section */}
      <Card sx={{ textAlign: 'left' }}>
        {/* Tabs */}
        <Box sx={{ 
          px: { xs: 2, sm: 3 }, 
          pt: { xs: 2, sm: 3 },
          pb: 0,
          borderBottom: 'none'
        }}>
          <Box sx={{
            display: 'flex',
            backgroundColor: 'background.default',
            borderRadius: 0.75,
            p: 0.25,
            mb: 0,
            border: '1px solid',
            borderColor: 'divider',
          }}>
            <Button
              onClick={() => setActiveTab(0)}
              sx={{
                flex: 1,
                py: 1,
                px: 2.5,
                borderRadius: 0.5,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.9rem',
                backgroundColor: activeTab === 0 ? theme => theme.palette.background.paper : 'transparent',
                color: activeTab === 0 ? 'text.primary' : 'text.secondary',
                boxShadow: activeTab === 0 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                border: 'none',
                minHeight: '38px',
                '&:hover': {
                  backgroundColor: activeTab === 0 ? theme.palette.background.paper : theme.palette.action.hover,
                  border: 'none',
                },
                '&:focus': {
                  outline: 'none',
                  border: 'none',
                  boxShadow: activeTab === 0 ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                },
              }}
            >
              Main RFP Documents
            </Button>
            
            <Button
              disabled
              sx={{
                flex: 1,
                py: 1,
                px: 2.5,
                borderRadius: 0.5,
                textTransform: 'none',
                fontWeight: 500,
                fontSize: '0.9rem',
                backgroundColor: 'transparent',
                color: 'text.disabled',
                border: 'none',
                cursor: 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                minHeight: '38px',
                '&:hover': {
                  backgroundColor: 'transparent',
                  border: 'none',
                },
                '&:focus': {
                  outline: 'none',
                  border: 'none',
                },
                '&.Mui-disabled': {
                  color: 'text.disabled',
                },
              }}
            >
              <span>Supporting Documents & Links</span>
              <Chip
                icon={<ScheduleIcon sx={{ fontSize: '11px !important' }} />}
                label="Coming Soon"
                size="small"
                variant="outlined"
                sx={{
                  borderColor: 'warning.main',
                  color: 'warning.main',
                  height: '16px',
                  fontSize: '0.6rem',
                  fontWeight: 500,
                  '& .MuiChip-icon': {
                    color: 'warning.main',
                  },
                  '& .MuiChip-label': {
                    px: 0.5,
                  },
                }}
              />
            </Button>
          </Box>
        </Box>

        {/* Tab Content */}
        <CardContent sx={{ p: { xs: 2, sm: 3 }, pt: 0 }}>
          {activeTab === 0 && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                Upload the primary RFP document that needs responses. This is typically the main RFP file with requirements and questions.
              </Typography>

              <Paper
                key={theme.palette.mode} // Force re-render when theme changes
                className={dragOver ? 'dragover' : ''}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); if (uploadedFiles.length === 0) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                sx={{
                  border: `2px dashed ${theme.palette.primary.main}`,
                  borderRadius: 1,
                  p: 6,
                  textAlign: 'center',
                  backgroundColor: theme.palette.mode === 'light' ? '#F0F8FF' : '#1a1a1a',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    borderColor: theme.palette.primary.dark,
                    backgroundColor: theme.palette.mode === 'light' ? '#E3F2FD' : '#2a2a2a',
                  },
                  '&.dragover': {
                    borderColor: theme.palette.primary.dark,
                    backgroundColor: theme.palette.mode === 'light' ? '#E3F2FD' : '#2a2a2a',
                    transform: 'scale(1.02)',
                  },
                  ...(uploadedFiles.length > 0 && {
                    opacity: 0.6,
                    cursor: 'not-allowed',
                    pointerEvents: 'none'
                  })
                }}
              >
                <FileIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1 }}>
                  {uploadedFiles.length > 0 ? `Main RFP document selected` : 'Drop main RFP file here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  PDF, Word, Text files (max 50MB) - One file only
                </Typography>
                <Button
                  variant="outlined"
                  component="label"
                  disabled={uploadedFiles.length > 0}
                  sx={{ mt: 1 }}
                >
                  {uploadedFiles.length > 0 ? 'Replace Main RFP File' : 'Select Main RFP File'}
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.txt"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </Button>
              </Paper>
            </Box>
          )}

          {activeTab === 1 && (
            <Box>
              <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                Upload additional supporting documents, reference materials, and relevant links to enhance the proposal analysis.
              </Typography>

              <Paper
                sx={{
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  padding: 4,
                  textAlign: 'center',
                  backgroundColor: 'background.default',
                  cursor: 'not-allowed',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                <LinkIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                <Typography variant="h6" sx={{ mb: 1, color: 'text.disabled' }}>
                  Supporting Documents Upload
                </Typography>
                <Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
                  Additional PDFs, Word files, and external links
                </Typography>
                <Button
                  variant="outlined"
                  disabled
                  sx={{ mt: 1 }}
                >
                  Select Supporting Files
                </Button>
              </Paper>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Show uploaded files list if any files exist */}
      {uploadedFiles.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <UploadedFilesList
            files={uploadedFiles}
            onRemoveFile={handleRemoveFile}
            showTitle={false}
          />
        </Box>
      )}

      {/* Start Analysis Button */}
      <Box sx={{ 
        mt: 3, 
        textAlign: 'center'
      }}>
        <Button
          variant="contained"
          size="large"
          onClick={handleSubmit}
          disabled={uploadedFiles.length === 0 || !projectName.trim() || isLoading}
          sx={{ 
            minWidth: { xs: 'auto', sm: 320 },
            width: { xs: '100%', sm: 'auto' },
            height: 48,
            fontSize: { xs: '0.95rem', sm: '1rem' },
            fontWeight: 600,
            borderRadius: 2,
            textTransform: 'none',
            boxShadow: 2,
            '&:hover': {
              boxShadow: 4,
            },
          }}
        >
          {isLoading ? 'Analyzing...' : `Start AI Analysis (${mainFileCount} main document + 0 supporting items)`}
        </Button>
      </Box>
    </Box>
  );
};

export default UploadScreen;