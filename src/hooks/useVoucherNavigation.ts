import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { ActionCreatorWithPayload, ActionCreatorWithoutPayload } from '@reduxjs/toolkit';
import { useConfirm } from './useConfirm';

interface VoucherNavigationActions {
    setMode: ActionCreatorWithPayload<'new' | 'viewing' | 'editing'>;
    setCurrentVoucherId: ActionCreatorWithPayload<number | null>;
    setCurrentVoucherNo?: ActionCreatorWithPayload<string | undefined>;
    setNavigationData: ActionCreatorWithPayload<{ hasPrevious: boolean; hasNext: boolean; previousId: number | null; nextId: number | null }>;
    setHasUnsavedChanges: ActionCreatorWithPayload<boolean>;
    resetForm: ActionCreatorWithoutPayload;
}

interface UseVoucherNavigationProps {
    voucherType: string;
    sliceState: any; // Checked against VoucherNavigationState
    actions: VoucherNavigationActions;
    onLoadVoucher: (id: number) => Promise<void>;
}

export function useVoucherNavigation({
    voucherType,
    sliceState,
    actions,
    onLoadVoucher
}: UseVoucherNavigationProps) {
    const dispatch = useDispatch();
    const confirm = useConfirm();
    const { mode, currentVoucherId, hasUnsavedChanges, navigationData } = sliceState;

    // Check for previous/next IDs when current ID changes
    useEffect(() => {
        if (currentVoucherId) {
            checkNavigation(currentVoucherId);
        }
    }, [currentVoucherId]);

    const checkNavigation = async (id: number) => {
        try {
            const [prevId, nextId] = await Promise.all([
                invoke<number | null>('get_previous_voucher_id', { voucherType, currentId: id }),
                invoke<number | null>('get_next_voucher_id', { voucherType, currentId: id })
            ]);

            dispatch(actions.setNavigationData({
                hasPrevious: prevId !== null,
                hasNext: nextId !== null,
                previousId: prevId,
                nextId: nextId
            }));
        } catch (error) {
            console.error('Failed to check navigation:', error);
        }
    };

    const confirmDiscardChanges = async () => {
        if (hasUnsavedChanges) {
            const confirmed = await confirm({
                title: 'Unsaved Changes',
                description: 'You have unsaved changes. Discard them?',
                confirmText: 'Discard',
                cancelText: 'Keep Editing',
                variant: 'destructive'
            });
            if (!confirmed) return false;
            dispatch(actions.setHasUnsavedChanges(false));
            return true;
        }
        return true;
    };

    const handleNavigatePrevious = async () => {
        if (mode === 'editing' && hasUnsavedChanges) {
            if (!await confirmDiscardChanges()) return;
        }
        if (navigationData.previousId) {
            dispatch(actions.setMode('viewing'));
            dispatch(actions.setCurrentVoucherId(navigationData.previousId));
            await onLoadVoucher(navigationData.previousId);
        }
    };

    const handleNavigateNext = async () => {
        if (mode === 'editing' && hasUnsavedChanges) {
            if (!await confirmDiscardChanges()) return;
        }
        if (navigationData.nextId) {
            dispatch(actions.setMode('viewing'));
            dispatch(actions.setCurrentVoucherId(navigationData.nextId));
            await onLoadVoucher(navigationData.nextId);
        }
    };

    const handleListSelect = async (id: number) => {
        // Only show warning if actually in editing mode with unsaved changes
        if (mode === 'editing' && hasUnsavedChanges) {
            if (!await confirmDiscardChanges()) return;
        }
        dispatch(actions.setMode('viewing'));
        dispatch(actions.setCurrentVoucherId(id));
        await onLoadVoucher(id);
    };

    const handleNew = async (force: boolean = false) => {
        if (!force && mode === 'editing') {
            if (!await confirmDiscardChanges()) return;
        }
        dispatch(actions.resetForm());
        dispatch(actions.setMode('new'));
        dispatch(actions.setCurrentVoucherId(null));
        if (actions.setCurrentVoucherNo) {
            dispatch(actions.setCurrentVoucherNo(undefined));
        }
        dispatch(actions.setNavigationData({
            hasPrevious: false,
            hasNext: false,
            previousId: null,
            nextId: null
        }));
    };

    const handleEdit = () => {
        dispatch(actions.setMode('editing'));
    };

    const handleCancel = async () => {
        if (!await confirmDiscardChanges()) return;

        if (currentVoucherId) {
            dispatch(actions.setMode('viewing'));
            // Reload data to reset form
            await onLoadVoucher(currentVoucherId);
        } else {
            handleNew();
        }
    };

    const handleSaveSuccess = (newId: number) => {
        dispatch(actions.setHasUnsavedChanges(false));
        dispatch(actions.setMode('viewing'));
        dispatch(actions.setCurrentVoucherId(newId));
        // Refresh navigation flags
        checkNavigation(newId);
    };

    const handleDelete = async () => {
        if (!currentVoucherId) return false;
        const confirmed = await confirm({
            title: 'Delete Voucher',
            description: 'Are you sure you want to delete this voucher? This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            variant: 'destructive'
        });
        return confirmed;
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Alt+Left / Alt+Right
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                handleNavigatePrevious();
            }
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                handleNavigateNext();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigationData, mode, hasUnsavedChanges]);

    return {
        handleNavigatePrevious,
        handleNavigateNext,
        handleListSelect,
        handleNew,
        handleEdit,
        handleCancel,
        handleSaveSuccess,
        handleDelete,
    };
}
