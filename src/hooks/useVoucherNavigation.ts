import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { invoke } from '@tauri-apps/api/core';
import { ActionCreatorWithPayload, ActionCreatorWithoutPayload } from '@reduxjs/toolkit';
import { useConfirm } from './useConfirm';

interface VoucherNavigationActions {
    setMode: ActionCreatorWithPayload<'new' | 'viewing' | 'editing'>;
    setCurrentVoucherId: ActionCreatorWithPayload<string | null>;
    setCurrentVoucherNo?: ActionCreatorWithPayload<string | undefined>;
    setNavigationData: ActionCreatorWithPayload<{ hasPrevious: boolean; hasNext: boolean; previousId: string | null; nextId: string | null }>;
    setHasUnsavedChanges: ActionCreatorWithPayload<boolean>;
    resetForm: ActionCreatorWithoutPayload;
}

interface UseVoucherNavigationProps {
    voucherType: string;
    sliceState: any; // Checked against VoucherNavigationState
    actions: VoucherNavigationActions;
    onLoadVoucher: (id: string) => Promise<void>;
    onDelete?: () => Promise<void> | void;
}

export function useVoucherNavigation({
    voucherType,
    sliceState,
    actions,
    onLoadVoucher,
    onDelete: onDeleteCallback,
}: UseVoucherNavigationProps) {
    const dispatch = useDispatch();
    const confirm = useConfirm();
    const { mode, currentVoucherId, hasUnsavedChanges, navigationData } = sliceState;

    // ---- New-mode: preview number + last voucher ID ----
    const [nextVoucherNo, setNextVoucherNo] = useState<string | undefined>(undefined);
    const [lastVoucherId, setLastVoucherId] = useState<string | null>(null);

    const fetchNewModeData = async () => {
        try {
            const [previewNo, lastId] = await Promise.all([
                invoke<string>('get_next_voucher_number_preview', { voucherType }),
                invoke<string | null>('get_last_voucher_id', { voucherType })
            ]);
            setNextVoucherNo(previewNo);
            setLastVoucherId(lastId);
        } catch (err) {
            console.error('Failed to fetch new mode data:', err);
        }
    };

    useEffect(() => {
        if (mode === 'new' && !currentVoucherId) {
            fetchNewModeData();
        } else {
            // Clear once we leave new mode
            setNextVoucherNo(undefined);
            setLastVoucherId(null);
        }
    }, [mode, currentVoucherId, voucherType]);

    const hasLastVoucher = lastVoucherId !== null;

    // Check for previous/next IDs when current ID changes
    useEffect(() => {
        if (currentVoucherId) {
            checkNavigation(currentVoucherId);
        }
    }, [currentVoucherId]);

    const checkNavigation = async (id: string) => {
        try {
            const [prevId, nextId] = await Promise.all([
                invoke<string | null>('get_previous_voucher_id', { voucherType, currentId: id }),
                invoke<string | null>('get_next_voucher_id', { voucherType, currentId: id })
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

    const handleNavigateToLast = async () => {
        if (!lastVoucherId) return;
        if (mode === 'editing' && hasUnsavedChanges) {
            if (!await confirmDiscardChanges()) return;
        }
        dispatch(actions.setHasUnsavedChanges(false));
        dispatch(actions.setMode('viewing'));
        dispatch(actions.setCurrentVoucherId(lastVoucherId));
        await onLoadVoucher(lastVoucherId);
    };

    const handleNavigatePrevious = async () => {
        if (mode === 'editing' && hasUnsavedChanges) {
            if (!await confirmDiscardChanges()) return;
        }
        if (mode === 'new' && hasLastVoucher) {
            await handleNavigateToLast();
            return;
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
        } else if (mode === 'viewing') {
            // PageDown / Alt+Right on the last saved voucher transitions back to new mode
            await handleNew();
        }
    };

    const handleListSelect = async (id: string) => {
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
        dispatch(actions.setHasUnsavedChanges(false));
        if (actions.setCurrentVoucherNo) {
            dispatch(actions.setCurrentVoucherNo(undefined));
        }
        dispatch(actions.setNavigationData({
            hasPrevious: false,
            hasNext: false,
            previousId: null,
            nextId: null
        }));
        fetchNewModeData();
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

    const handleSaveSuccess = (newId: string) => {
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
            // Previous voucher: Alt+Left or PageUp
            if ((e.altKey && e.code === 'ArrowLeft') || e.code === 'PageUp') {
                e.preventDefault();
                handleNavigatePrevious();
                return;
            }
            // Next voucher: Alt+Right or PageDown
            if ((e.altKey && e.code === 'ArrowRight') || e.code === 'PageDown') {
                e.preventDefault();
                handleNavigateNext();
                return;
            }
            // Delete voucher: Ctrl+Delete, Alt+D, or Ctrl+D (when in viewing mode)
            if (mode === 'viewing' && currentVoucherId) {
                if (
                    ((e.ctrlKey || e.metaKey) && e.code === 'Delete') ||
                    (e.altKey && e.code === 'KeyD') ||
                    ((e.ctrlKey || e.metaKey) && e.code === 'KeyD')
                ) {
                    e.preventDefault();
                    if (onDeleteCallback) {
                        onDeleteCallback();
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigationData, mode, hasUnsavedChanges, currentVoucherId, lastVoucherId, onDeleteCallback]);

    return {
        handleNavigatePrevious,
        handleNavigateNext,
        handleListSelect,
        handleNew,
        handleEdit,
        handleCancel,
        handleSaveSuccess,
        handleDelete,
        // New-mode extras
        nextVoucherNo,
        hasLastVoucher,
        refreshNewModeData: fetchNewModeData,
        handleNavigateToLast,
    };
}

