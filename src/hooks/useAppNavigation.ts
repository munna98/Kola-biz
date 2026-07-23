import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import { navigateTo as navigateToAction, goBack as goBackAction, goForward as goForwardAction } from '../store';
import { useConfirm } from './useConfirm';

/**
 * Selector that returns true if ANY active voucher page has unsaved changes.
 * This is used to guard page-level back/forward navigation.
 */
export function selectAnyUnsavedChanges(state: RootState): boolean {
  return (
    (state.purchaseInvoice.mode === 'editing' && state.purchaseInvoice.hasUnsavedChanges) ||
    (state.purchaseReturn.mode === 'editing' && state.purchaseReturn.hasUnsavedChanges) ||
    (state.salesInvoice.mode === 'editing' && state.salesInvoice.hasUnsavedChanges) ||
    (state.salesReturn.mode === 'editing' && state.salesReturn.hasUnsavedChanges) ||
    (state.salesQuotation.mode === 'editing' && state.salesQuotation.hasUnsavedChanges) ||
    (state.deliveryNote.mode === 'editing' && state.deliveryNote.hasUnsavedChanges) ||
    (state.payment.mode === 'editing' && state.payment.hasUnsavedChanges) ||
    (state.receipt.mode === 'editing' && state.receipt.hasUnsavedChanges) ||
    (state.journalEntry.mode === 'editing' && state.journalEntry.hasUnsavedChanges) ||
    (state.openingBalance.mode === 'editing' && state.openingBalance.hasUnsavedChanges) ||
    (state.openingStock.mode === 'editing' && state.openingStock.hasUnsavedChanges) ||
    (state.stockJournal.mode === 'editing' && state.stockJournal.hasUnsavedChanges)
  );
}

/**
 * useAppNavigation - page-level browser-style navigation hook.
 *
 * Wraps navigateTo / goBack / goForward with an unsaved-changes confirmation
 * dialog before actually switching the active section.
 *
 * Also registers Ctrl+Left / Ctrl+Right keyboard shortcuts for back/forward.
 */
export function useAppNavigation() {
  const dispatch = useDispatch();
  const confirm = useConfirm();

  const hasUnsavedChanges = useSelector(selectAnyUnsavedChanges);
  const navIndex = useSelector((state: RootState) => state.app.navIndex);
  const navHistoryLength = useSelector((state: RootState) => state.app.navHistory.length);

  const canGoBack = navIndex > 0;
  const canGoForward = navIndex < navHistoryLength - 1;

  const guardedAction = async (action: () => void) => {
    if (hasUnsavedChanges) {
      const confirmed = await confirm({
        title: 'Unsaved Changes',
        description: 'You have unsaved changes that will be lost. Leave this page anyway?',
        confirmText: 'Leave Page',
        cancelText: 'Stay',
        variant: 'destructive',
      });
      if (!confirmed) return;
    }
    action();
  };

  const navigateTo = (section: string, params?: Record<string, any>) =>
    guardedAction(() => dispatch(navigateToAction({ section, params })));

  const goBack = () => guardedAction(() => dispatch(goBackAction()));

  const goForward = () => guardedAction(() => dispatch(goForwardAction()));

  // Ctrl+Left = Go Back, Ctrl+Right = Go Forward
  // (uses Ctrl to avoid conflict with Alt+Left/Right used for within-voucher record navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        if (canGoBack) goBack();
      }
      if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault();
        if (canGoForward) goForward();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoBack, canGoForward, hasUnsavedChanges]);

  return { navigateTo, goBack, goForward, canGoBack, canGoForward };
}
