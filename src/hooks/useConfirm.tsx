import { useContext } from 'react';
import { ConfirmDialogContext } from '@/components/providers/ConfirmDialogProvider';

export interface ConfirmOptions {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
}

export function useConfirm() {
    const context = useContext(ConfirmDialogContext);

    if (!context) {
        throw new Error('useConfirm must be used within ConfirmDialogProvider');
    }

    return context.confirm;
}
