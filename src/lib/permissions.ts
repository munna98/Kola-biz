import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { can as canCheck, Permission } from "./tauri";

/**
 * Hook to access current user's permissions and role.
 */
export function usePermissions() {
    const { user, permissions, permissionsRoleId, permissionsRoleName } = useSelector((state: RootState) => state.auth);
    const isAdmin = user?.role === "admin";

    /**
     * Check if user has permission for a specific page and action.
     * Admin always returns true.
     */
    const can = (pageId: string, action: keyof Permission): boolean => {
        if (isAdmin) return true;
        if (!permissions) return true; // default open while loading or if not set
        return canCheck(permissions, pageId, action);
    };

    /**
     * Check permissions for multiple actions on a single page at once.
     */
    const forPage = (pageId: string): Permission => {
        if (isAdmin) {
            return { view: true, create: true, edit: true, delete: true, void: true, print: true };
        }
        const p = permissions?.[pageId];
        return {
            view: p?.view ?? true,
            create: p?.create ?? false,
            edit: p?.edit ?? false,
            delete: p?.delete ?? false,
            void: p?.void ?? false,
            print: p?.print ?? false,
        };
    };

    return {
        isAdmin,
        user,
        permissions,
        roleId: permissionsRoleId,
        roleName: permissionsRoleName,
        can,
        forPage,
    };
}
