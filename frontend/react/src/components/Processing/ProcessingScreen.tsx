import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Card,
  CardContent,
  Button,
  Paper,
  styled,
  Grid,
} from '@mui/material';
import {
  Description as DocumentIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';

const IllustrationBox = styled(Box)(() => ({
  width: 400,
  height: 250,
  backgroundColor: '#1976D2',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 32px auto',
  position: 'relative',
  overflow: 'hidden',
  background: 'linear-gradient(45deg, #1976D2 30%, #42A5F5 90%)',
}));

const BrainIcon = styled(Box)(({ theme }) => ({
  width: 80,
  height: 80,
  borderRadius: '50%',
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  animation: 'pulse 2s ease-in-out infinite',
  '&::before': {
    content: '""',
    position: 'absolute',
    width: '60%',
    height: '60%',
    background: 'white',
    borderRadius: '50%',
    opacity: 0.8,
  },
  '&::after': {
    content: '""',
    position: 'absolute',
    width: '30%',
    height: '30%',
    background: theme.palette.primary.main,
    borderRadius: '50%',
  },
  '@keyframes pulse': {
    '0%': {
      transform: 'scale(1)',
      opacity: 1,
    },
    '50%': {
      transform: 'scale(1.1)',
      opacity: 0.8,
    },
    '100%': {
      transform: 'scale(1)',
      opacity: 1,
    },
  },
}));

interface ProcessingScreenProps {
  fileName: string;
  progress: number;
  isComplete: boolean;
  documentsAnalyzed: number;
  sectionsIdentified: number;
  responsesGenerated: number;
  onContinue: () => void;
  onBack: () => void;
}

// Helper function to get current processing status based on progress
const getProcessingStatus = (progress: number) => {
  if (progress >= 95) return { stage: 'finalizing', message: '🎯 Finalizing analysis results...', icon: '🎯' };
  if (progress >= 85) return { stage: 'templates', message: '📋 Preparing response templates...', icon: '📋' };
  if (progress >= 70) return { stage: 'sections', message: '📑 Identifying RFP sections...', icon: '📑' };
  if (progress >= 55) return { stage: 'extraction', message: '🔍 Extracting content and requirements...', icon: '🔍' };
  if (progress >= 40) return { stage: 'structure', message: '📊 Analyzing document structure...', icon: '📊' };
  if (progress >= 25) return { stage: 'parsing', message: '📄 Parsing document content...', icon: '📄' };
  if (progress >= 15) return { stage: 'initial', message: '🚀 Initializing AI analysis...', icon: '🚀' };
  return { stage: 'starting', message: '⏳ Starting document processing...', icon: '⏳' };
};

const ProcessingScreen: React.FC<ProcessingScreenProps> = React.memo(({
  fileName,
  progress,
  isComplete,
  documentsAnalyzed,
  sectionsIdentified,
  responsesGenerated,
  onContinue,
  onBack,
}) => {
  // Only animate progress bar if not complete
  const [animatedProgress, setAnimatedProgress] = useState(progress);
  useEffect(() => {
    if (!isComplete && progress > animatedProgress) {
      const interval = setInterval(() => {
        setAnimatedProgress(prev => {
          if (prev >= progress) {
            clearInterval(interval);
            return progress;
          }
          return Math.min(prev + 1, progress);
        });
      }, 15);
      return () => clearInterval(interval);
    } else {
      setAnimatedProgress(progress);
    }
  }, [progress, isComplete]);
  const currentStatus = getProcessingStatus(isComplete ? progress : animatedProgress);

  return (
    <Box sx={{ 
      maxWidth: 800, 
      mx: 'auto', 
      p: { xs: 2, sm: 3, md: 4 },
      width: '100%',
      minHeight: '600px', // Add minimum height to prevent layout shift
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Illustration */}
      <IllustrationBox>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Brain/AI Processing Icon */}
          <BrainIcon />
          
          {/* Floating Documents */}
          {[...Array(8)].map((_, index) => (
            <Box
              key={index}
              sx={{
                position: 'absolute',
                width: 28,
                height: 36,
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: `float 3s ease-in-out infinite, rotate 6s linear infinite`,
                animationDelay: `${index * 0.4}s, ${index * 0.8}s`,
                left: `${15 + (index * 10)}%`,
                top: `${20 + Math.sin(index) * 40}%`,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              <DocumentIcon sx={{ fontSize: 18, color: '#1976D2' }} />
            </Box>
          ))}
        </Box>
        

      </IllustrationBox>

      {/* Title */}
      <Typography variant="h3" align="center" sx={{ mb: 2, fontWeight: 700 }}>
        Agent is Processing Your RFP
      </Typography>
      <Typography variant="body1" align="center" sx={{ mb: 4, color: 'text.secondary' }}>
        Agent is analyzing the RFP document and generating intelligent responses
      </Typography>

      {/* Progress Card */}
      <Card sx={{ mb: 4 }}>
        <CardContent sx={{ p: 4 }}>
          {!isComplete && (
            <>
              <Box sx={{ width: '100%', maxWidth: 600, mx: 'auto', mb: 3 }}>
                <LinearProgress
                  variant="indeterminate"
                  sx={{
                    height: 12,
                    borderRadius: 6,
                    backgroundColor: '#E3F2FD',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: '#2196F3',
                      borderRadius: 6,
                    },
                  }}
                />
              </Box>
            </>
          )}
          {isComplete && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
              <CheckIcon sx={{ color: 'success.main', fontSize: 32, mr: 2 }} />
              <Typography variant="h4" sx={{ color: 'success.main', fontWeight: 700 }}>
                Processing complete!
              </Typography>
            </Box>
          )}
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Current Processing Status
          </Typography>
          <Box sx={{ mb: 2, minHeight: '200px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
              <Typography variant="body2">📄 Uploaded: {fileName}</Typography>
            </Box>
            {/* ...existing code for stages and status indicator... */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: progress >= 25 ? 1 : 0.3 }}>
              {progress >= 25 ? <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /> : 
               <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #ccc' }} />}
              <Typography variant="body2">📄 Document parsing</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: progress >= 40 ? 1 : 0.3 }}>
              {progress >= 40 ? <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /> : 
               <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #ccc' }} />}
              <Typography variant="body2">📄 Document structure analysis</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: progress >= 55 ? 1 : 0.3 }}>
              {progress >= 55 ? <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /> : 
               <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #ccc' }} />}
              <Typography variant="body2">📄 Content extraction</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: progress >= 70 ? 1 : 0.3 }}>
              {progress >= 70 ? <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /> : 
               <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #ccc' }} />}
              <Typography variant="body2">📄 Section identification</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, opacity: progress >= 85 ? 1 : 0.3 }}>
              {progress >= 85 ? <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} /> : 
               <Box sx={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #ccc' }} />}
              <Typography variant="body2">📄 Template preparation</Typography>
            </Box>
            {/* Current status indicator */}
            {!isComplete && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Box sx={{ 
                  width: 16, 
                  height: 16, 
                  borderRadius: '50%', 
                  border: '2px solid #2196F3', 
                  borderTop: '2px solid transparent',
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{currentStatus.message}</Typography>
              </Box>
            )}
            {isComplete && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, p: 2, bgcolor: '#e8f5e8', borderRadius: 1 }}>
                <CheckIcon sx={{ color: 'success.main', fontSize: 20 }} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>✅ Analysis complete! Starting draft generation...</Typography>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Stats Grid */}
    <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mb: 4, justifyContent: 'center', textAlign: 'center' }}>
        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              textAlign: 'center',
              backgroundColor: '#E3F2FD',
              border: '2px solid #2196F3',
              minHeight: { xs: '120px', sm: '140px' }
            }}
          >
            <Typography 
              variant="h3" 
              sx={{ 
                color: 'primary.main', 
                fontWeight: 700, 
                mb: 1,
                fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' }
              }}
            >
              {documentsAnalyzed}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Documents Analyzed
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              textAlign: 'center',
              backgroundColor: '#FFF3E0',
              border: '2px solid #FF9800',
              minHeight: { xs: '120px', sm: '140px' }
            }}
          >
            <Typography 
              variant="h3" 
              sx={{ 
                color: '#FF9800', 
                fontWeight: 700, 
                mb: 1,
                fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' }
              }}
            >
              {sectionsIdentified}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              RFP Sections Identified
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Paper
            sx={{
              p: { xs: 2, sm: 3 },
              textAlign: 'center',
              backgroundColor: '#E8F5E8',
              border: '2px solid #4CAF50',
              minHeight: { xs: '120px', sm: '140px' }
            }}
          >
            <Typography 
              variant="h3" 
              sx={{ 
                color: '#4CAF50', 
                fontWeight: 700, 
                mb: 1,
                fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' }
              }}
            >
              {responsesGenerated}
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 600,
                fontSize: { xs: '0.75rem', sm: '0.875rem' }
              }}
            >
              Responses Generated
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'center', 
        gap: 2,
        px: { xs: 1, sm: 0 }
      }}>
        <Button
          variant="outlined"
          onClick={onBack}
          sx={{ 
            minWidth: { xs: 'auto', sm: 120 },
            order: { xs: 2, sm: 1 }
          }}
        >
          Back
        </Button>
        <Button
          variant="contained"
          onClick={onContinue}
          disabled={true}
          sx={{ 
            minWidth: { xs: 'auto', sm: 200 },
            height: 48,
            fontSize: { xs: '1rem', sm: '1.1rem' },
            fontWeight: 600,
            order: { xs: 1, sm: 2 },
            opacity: isComplete ? 0.7 : 0.5
          }}
        >
          {isComplete ? 'Auto-generating...' : 'Continue'}
        </Button>
      </Box>
    </Box>
  );
});

export default ProcessingScreen;