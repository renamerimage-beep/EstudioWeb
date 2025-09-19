/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import type { AppView } from '../App';
import { type User } from '../services/userService';
// FIX: Import SparklesIcon from centralized icons file and remove local definition.
import { SparklesIcon, UserIcon } from './icons';

interface HeaderProps {
    currentView: AppView;
    onNavigate: (view: AppView) => void;
    currentUser: User;
    onLogout: () => void;
}


const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, currentUser, onLogout }) => {
    let navItems: { view: AppView, label: string }[] = [
      { view: 'upload', label: 'Upload' },
      { view: 'editor', label: 'Editor' },
      { view: 'gallery', label: 'Galeria' },
      { view: 'costs', label: 'Custos' },
    ];

    if (currentUser.role === 'admin') {
      navItems.push({ view: 'users', label: 'Usuários' });
    }

  return (
    <header className="w-full py-3 px-8 border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="w-full max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onNavigate('upload')}>
              <SparklesIcon className="w-6 h-6 text-blue-500" />
              <h1 className="text-xl font-bold tracking-tight text-gray-900">
                Estúdio Web
              </h1>
          </div>
          
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 p-1 bg-gray-200/70 rounded-lg">
              {navItems.map(item => (
                   <button
                      key={item.view}
                      onClick={() => onNavigate(item.view)}
                      className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 ${
                          currentView === item.view
                          ? 'bg-white text-gray-900 shadow'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                      {item.label}
                  </button>
              ))}
          </nav>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-right">
                <div className="text-sm">
                    <p className="font-semibold text-gray-800">{currentUser.username}</p>
                    <p className="text-xs text-gray-500 capitalize">{currentUser.role === 'admin' ? 'Administrador' : 'Usuário'}</p>
                </div>
                 <UserIcon className="w-8 h-8 p-1.5 bg-gray-200 text-gray-600 rounded-full" />
            </div>
            <button onClick={onLogout} className="text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors">
                Sair
            </button>
          </div>
      </div>
    </header>
  );
};

export default Header;