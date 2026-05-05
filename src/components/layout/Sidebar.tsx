import { useDispatch, useSelector } from 'react-redux';
import { RootState, toggleSidebar, setActiveSection } from '../../store';
import { IconLayoutSidebar, IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { ALL_MENU_ITEMS } from '../../lib/menu-items';

export default function Sidebar() {
    const dispatch = useDispatch();
    const { sidebarCollapsed, activeSection, sidebarItems } = useSelector((state: RootState) => state.app);
    
    // Create the final list of items based on enabled IDs and ensure we preserve the master order
    const visibleMenuItems = ALL_MENU_ITEMS.filter(item => sidebarItems.includes(item.id));

    return (
        <aside className={`bg-card border-r transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-56'}`}>
            <div className="flex items-center justify-between p-4 border-b h-14">
                {!sidebarCollapsed && (
                    <h1 className="font-bold text-lg font-hammersmith">
                        <span className="text-yellow-500">KolaB</span>
                        <span className="text-green-600">i</span>
                        <span className="text-yellow-500">z ERP</span>
                    </h1>
                )}
                <button
                    onClick={() => dispatch(toggleSidebar())}
                    className="p-1 hover:bg-accent rounded"
                >
                    {sidebarCollapsed ? <IconLayoutSidebar size={20} /> : <IconLayoutSidebarLeftCollapse size={20} />}
                </button>
            </div>
            <nav className="p-2">
                {visibleMenuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => dispatch(setActiveSection(item.id))}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md mb-1 transition-colors ${activeSection === item.id
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-accent'
                            }`}
                    >
                        <item.icon size={20} />
                        {!sidebarCollapsed && <span>{item.label}</span>}
                    </button>
                ))}
            </nav>
        </aside>
    );
}
