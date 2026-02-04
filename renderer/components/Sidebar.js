import React from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

function Sidebar({ collapsed, onToggle }) {
  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {!collapsed && (
        <div className="sidebar-content">
          <div className="sidebar-header">
            <span>Sidebar</span>
            <button className="collapse-btn" onClick={onToggle}>
              <PanelLeftClose size={16} />
            </button>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="sidebar-collapsed">
          <button className="expand-btn" onClick={onToggle}>
            <PanelLeft size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Sidebar;
