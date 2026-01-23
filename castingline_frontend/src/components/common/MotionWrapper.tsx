import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

// ----------------------------------------------------------------------

type FadeInProps = HTMLMotionProps<'div'> & {
    children: React.ReactNode;
    duration?: number;
    delay?: number;
};

export const FadeIn = ({
    children,
    duration = 0.4,
    delay = 0,
    ...other
}: FadeInProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration, delay, ease: 'easeOut' }}
            {...other}
        >
            {children}
        </motion.div>
    );
};

// ----------------------------------------------------------------------

type ScaleButtonProps = HTMLMotionProps<'button'> & {
    children: React.ReactNode;
};

export const ScaleButton = ({ children, ...other }: ScaleButtonProps) => {
    return (
        <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            style={{ 
                border: 'none', 
                background: 'none', 
                padding: 0, 
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
            {...other}
        >
            {children}
        </motion.button>
    );
};
