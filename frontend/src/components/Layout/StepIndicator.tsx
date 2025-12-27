import React from 'react';
import { Box, Step, StepLabel, Stepper, Typography, StepConnector, styled } from '@mui/material';
import {
  Upload as UploadIcon,
  Settings as ProcessingIcon,
  Edit as ReviewIcon,
  Visibility as PreviewIcon,
  GetApp as ExportIcon,
} from '@mui/icons-material';

interface StepIndicatorProps {
  currentStep: 'upload' | 'processing' | 'analyzing' | 'analyzed' | 'analysis_results' | 'generating' | 'generating_drafts' | 'reviewing' | 'editing' | 'submitting' | 'complete';
}

const steps = [
  {
    key: 'upload',
    label: 'Upload',
    icon: <UploadIcon />,
    description: 'Upload documents',
  },
  {
    key: 'processing',
    label: 'Processing',
    icon: <ProcessingIcon />,
    description: 'AI analysis',
  },
  {
    key: 'review',
    label: 'Review Draft',
    icon: <ReviewIcon />,
    description: 'Review and edit',
  },
  {
    key: 'preview',
    label: 'Final Preview',
    icon: <PreviewIcon />,
    description: 'Final review',
  },
  {
    key: 'export',
    label: 'Export',
    icon: <ExportIcon />,
    description: 'Download results',
  },
];

// Custom StepConnector to align with 48px custom icons
const CustomStepConnector = styled(StepConnector)(({ theme }) => ({
  '&.MuiStepConnector-alternativeLabel': {
    display: 'none',
  },
  '& .MuiStepConnector-line': {
    display: 'none',
  },
}));

const getActiveStep = (currentStep: string): number => {
  switch (currentStep) {
    case 'upload':
      return 0;
    case 'analyzing':
      return 1;
    case 'analyzed':
      return 1;  // Mark processing step as completed
    case 'generating_drafts':
    case 'editing':
      return 2;
    case 'submitting':
      return 3;
    case 'complete':
      return 4;
    default:
      return 0;
  }
};

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  const activeStep = getActiveStep(currentStep);

  return (
    <Box sx={{ 
      py: { xs: 2, sm: 3 }, 
      backgroundColor: 'background.paper',
      position: 'relative'
    }}>
      <Stepper 
        activeStep={activeStep} 
        alternativeLabel
        sx={{
          '& .MuiStepConnector-root': {
            top: 24,
            left: 'calc(-50% + 16px)',
            right: 'calc(50% + 16px)',
            '& .MuiStepConnector-line': {
              height: 2,
              border: 0,
              backgroundColor: '#E2E8F0',
              borderRadius: 1,
            },
          },
          '& .MuiStepConnector-active': {
            '& .MuiStepConnector-line': {
              backgroundColor: '#1565C0',
            },
          },
          '& .MuiStepConnector-completed': {
            '& .MuiStepConnector-line': {
              backgroundColor: '#2E7D32',
            },
          },
          '& .MuiStep-root': {
            px: { xs: 0.5, sm: 1 },
          }
        }}
      >
        {steps.map((step, index) => (
          <Step key={step.key} completed={index < activeStep}>
            <StepLabel
              sx={{ 
                flexDirection: 'column',
                '& .MuiStepLabel-labelContainer': {
                  mt: 1
                }
              }}
              icon={
                <Box
                  sx={{
                    width: { xs: 40, sm: 48 },
                    height: { xs: 40, sm: 48 },
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: index < activeStep 
                      ? 'success.main' 
                      : index === activeStep 
                        ? 'primary.main' 
                        : '#E2E8F0',
                    color: index <= activeStep ? 'white' : '#94A3B8',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: index <= activeStep 
                      ? '0 4px 12px rgba(21, 101, 192, 0.25)' 
                      : 'none',
                    fontSize: { xs: '1.2rem', sm: '1.4rem' },
                    position: 'relative',
                    zIndex: 10,
                    border: index === activeStep ? '3px solid' : '2px solid',
                    borderColor: index < activeStep 
                      ? 'success.main' 
                      : index === activeStep 
                        ? 'primary.light' 
                        : 'transparent',
                  }}
                >
                  {step.icon}
                </Box>
              }
            >
              <Typography 
                variant="body2" 
                fontWeight={600} 
                sx={{ 
                  mt: 1,
                  color: index <= activeStep ? 'text.primary' : 'text.secondary',
                  fontSize: { xs: '0.75rem', sm: '0.875rem' }
                }}
              >
                {step.label}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{
                  color: 'text.secondary',
                  fontSize: { xs: '0.6rem', sm: '0.75rem' },
                  display: { xs: 'none', sm: 'block' }
                }}
              >
                {step.description}
              </Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default StepIndicator;