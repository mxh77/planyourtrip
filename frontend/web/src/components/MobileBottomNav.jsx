import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { GitBranch, Users, Lightbulb, Terminal, LogOut } from 'lucide-react';

const NAV_ITEMS = [
  { path: '/admin/devhub', label: 'Dev Hub', icon: Terminal },
  { path: '/admin/suggestions', label: 'Suggestions', icon: Lightbulb },
  { path: '/admin/users', label: 'Utilisateurs', icon: Users },
];

/**
 * Barre de navigation persistante en bas sur mobile (≤767px).
 * Affiche 3-5 items avec icône + texte.
 * Le bouton de déconnexion est en dernière position.
 */
export default function MobileBottomNav({ onLogout }) {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-lg md:hidden safe-area-bottom">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[56px] min-h-[44px] ${
                isActive
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : ''}`} />
              <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                {label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={onLogout}
          className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[56px] min-h-[44px] text-gray-500 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          <span className="text-[10px] font-medium leading-tight">Déconnexion</span>
        </button>
      </div>
    </nav>
  );
}