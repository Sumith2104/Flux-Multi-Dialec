'use client';

import * as React from 'react';
import LinearProgress, { type LinearProgressProps } from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

function LinearProgressWithLabel(props: LinearProgressProps & { value: number }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <Box sx={{ width: '100%', mr: 1 }}>
        <LinearProgress
          variant="determinate"
          {...props}
          sx={{
            backgroundColor: 'hsl(var(--secondary))',
            '& .MuiLinearProgress-bar': {
              backgroundColor: 'hsl(var(--primary))',
            },
            height: 8,
            borderRadius: 5,
          }}
        />
      </Box>
      <Box sx={{ minWidth: 35 }}>
        <Typography
          variant="body2"
          sx={{ color: 'hsl(var(--muted-foreground))' }}
        >{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  );
}

export function DeleteProgress() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    // This timer simulates progress with a smooth ease-out animation.
    const timer = setInterval(() => {
      setProgress((oldProgress) => {
        if (oldProgress >= 90) {
          clearInterval(timer);
          return 90;
        }
        // The increment gets smaller as progress approaches 90, creating a smooth slowdown.
        const remaining = 90 - oldProgress;
        const increment = remaining / 25; // Adjust divisor for speed
        return Math.min(oldProgress + increment, 90);
      });
    }, 50); // Update every 50ms for a smooth animation

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Box sx={{ width: '100%' }}>
      <LinearProgressWithLabel value={progress} />
    </Box>
  );
}
