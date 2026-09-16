import { invoke } from '@tauri-apps/api/core';
import {
    type BarcodeDesignerSettings,
    DEFAULT_DESIGNER_SETTINGS,
    migrateSettings,
} from '@/components/barcode/BarcodeLabelDesigner';

const MULTI_DESIGN_KEY = 'barcode_designs';
const LEGACY_DESIGN_KEY = 'barcode_settings';

/**
 * Normalizes a list of design objects, ensuring each design has an `id`, `name`,
 * migrated element structure, and that exactly ONE design has `isDefault: true`.
 */
export function normalizeBarcodeDesigns(rawDesigns: any[]): BarcodeDesignerSettings[] {
    if (!Array.isArray(rawDesigns) || rawDesigns.length === 0) {
        return [{ ...DEFAULT_DESIGNER_SETTINGS }];
    }

    const designs: BarcodeDesignerSettings[] = rawDesigns.map((raw, index) => {
        const migrated = migrateSettings(raw);
        return {
            ...migrated,
            id: raw.id || `design_${Date.now()}_${index}`,
            name: raw.name || (index === 0 ? 'Standard Label (50x25)' : `Barcode Design ${index + 1}`),
            isDefault: !!raw.isDefault,
        };
    });

    // Ensure exactly one default design
    const defaultCount = designs.filter(d => d.isDefault).length;
    if (defaultCount === 0) {
        designs[0].isDefault = true;
    } else if (defaultCount > 1) {
        let firstFound = false;
        designs.forEach(d => {
            if (d.isDefault) {
                if (!firstFound) firstFound = true;
                else d.isDefault = false;
            }
        });
    }

    return designs;
}

/**
 * Loads all barcode designs for the active business company from Tauri app settings.
 * Handles automatic migration from legacy single `barcode_settings` format.
 */
export async function loadBarcodeDesigns(): Promise<BarcodeDesignerSettings[]> {
    try {
        // Try new multi-design key first
        const multiSaved = await invoke<string | null>('get_app_setting', { key: MULTI_DESIGN_KEY });
        if (multiSaved) {
            const parsed = JSON.parse(multiSaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return normalizeBarcodeDesigns(parsed);
            }
        }

        // Fallback to legacy single-design key
        const legacySaved = await invoke<string | null>('get_app_setting', { key: LEGACY_DESIGN_KEY });
        if (legacySaved) {
            const parsed = JSON.parse(legacySaved);
            const single = migrateSettings(parsed);
            const legacyDesign: BarcodeDesignerSettings = {
                ...single,
                id: 'default',
                name: 'Standard Label (50x25)',
                isDefault: true,
            };
            // Save immediately in multi-design format for seamless migration
            await saveBarcodeDesigns([legacyDesign]);
            return [legacyDesign];
        }
    } catch (error) {
        console.error('Failed to load barcode designs:', error);
    }

    // Default if nothing stored
    return [{ ...DEFAULT_DESIGNER_SETTINGS }];
}

/**
 * Saves all barcode designs to Tauri app settings.
 * Also syncs the default design to `barcode_settings` for backward compatibility.
 */
export async function saveBarcodeDesigns(designs: BarcodeDesignerSettings[]): Promise<void> {
    const normalized = normalizeBarcodeDesigns(designs);
    const defaultDesign = normalized.find(d => d.isDefault) || normalized[0];

    await Promise.all([
        invoke('set_app_setting', {
            key: MULTI_DESIGN_KEY,
            value: JSON.stringify(normalized),
        }),
        invoke('set_app_setting', {
            key: LEGACY_DESIGN_KEY,
            value: JSON.stringify(defaultDesign),
        }),
    ]);
}

/**
 * Returns the default design from a list of barcode designs, or the first design if no default is marked.
 */
export function getDefaultDesign(designs: BarcodeDesignerSettings[]): BarcodeDesignerSettings {
    if (!designs || designs.length === 0) return DEFAULT_DESIGNER_SETTINGS;
    return designs.find(d => d.isDefault) || designs[0];
}
