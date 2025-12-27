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
    px: 4, 
    py: 2, 
    backgroundColor: 'background.paper',
    borderWidth: 0,
    borderBottom: 0,
    boxShadow: 'none',
    '&::after, &::before': {
      display: 'none',
      content: '""',
      borderBottom: 'none'
    },
    position: 'relative'
  }}>
      <Stepper 
        activeStep={activeStep} 
        alternativeLabel
        sx={{
          '& .MuiStepConnector-root': {
            position: 'relative',
            zIndex: 0
          },
          boxShadow: 'none',
          borderBottom: 'none',
          '&::after': {
            display: 'none'
          }
        }}
        connector={<CustomStepConnector />}
      >
        {steps.map((step, index) => (
          <Step key={step.key} completed={index < activeStep}>
            <StepLabel
              sx={{ 
                position: 'relative', 
                zIndex: 1, // Labels above connector line
                '& .MuiStepLabel-labelContainer': {
                  position: 'relative',
                  zIndex: 1
                }
              }}
              icon={
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: index <= activeStep ? 'primary.main' : 'rgba(0, 0, 0, 0.1)',
                    color: index <= activeStep ? 'white' : 'rgba(0, 0, 0, 0.4)',
                    transition: 'all 0.3s ease',
                    position: 'relative',
                    zIndex: 100, // Further increased z-index for all icons
                    boxShadow: index <= activeStep ? '0 2px 8px rgba(33,150,243,0.15)' : 'none',
                  }}
                >
                  {step.icon}
                </Box>
              }
            >
              <Typography variant="body2" fontWeight={600} sx={{ mt: 1 }}>
                {step.label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
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