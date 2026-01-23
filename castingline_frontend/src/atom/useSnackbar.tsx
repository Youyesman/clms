import { useSnackbar as useNotistack } from 'notistack';

export const useSnackbar = () => {
    const { enqueueSnackbar, closeSnackbar } = useNotistack();

    const showSnackbar = (message: string, options?: { variant?: 'default' | 'error' | 'success' | 'warning' | 'info' }) => {
        enqueueSnackbar(message, { variant: 'success', ...options });
    };

    return { showSnackbar, closeSnackbar };
};