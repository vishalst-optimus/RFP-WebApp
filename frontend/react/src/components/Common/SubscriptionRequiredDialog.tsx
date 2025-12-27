import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  IconButton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Lock as LockIcon,
  Star as StarIcon,
} from '@mui/icons-material';

interface SubscriptionRequiredDialogProps {
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
}

const SubscriptionRequiredDialog: React.FC<SubscriptionRequiredDialogProps> = ({
  open,
  onClose,
  onUpgrade,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          p: 1,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockIcon color="warning" />
          <Typography variant="h6" component="span">
            Subscription Required
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          <StarIcon sx={{ fontSize: 64, color: 'warning.main', mb: 2 }} />
          
          <Typography variant="h6" gutterBottom>
            Premium Feature
          </Typography>
          
          <Typography variant="body1" color="text.secondary" paragraph>
            This feature requires an active subscription to continue using the RFP Response Generator.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center' }}>
        <Button
          onClick={() => {
            if (onUpgrade) {
              onUpgrade();
            } else {
              // Default behavior - open subscription page
              window.open('/pricing', '_blank');
            }
            onClose();
          }}
          variant="contained"
          color="primary"
          startIcon={<StarIcon />}
          size="large"
        >
          Upgrade Now
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SubscriptionRequiredDialog;