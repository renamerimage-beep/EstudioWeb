/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { createUser, getAllUsers, type User, type UserRole } from '../services/userService';
import Spinner from './Spinner';

interface UserManagementViewProps {
    getToken: () => Promise<string | null>;
}

const UserManagementView: React.FC<UserManagementViewProps> = ({ getToken }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState<UserRole>('user');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication token not available.');
            const userList = await getAllUsers(token);
            setUsers(userList);
        } catch (err) {
            setError('Falha ao carregar a lista de usuários.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [getToken]);

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUsername || !newPassword) {
            setFormError("Nome de usuário e senha são obrigatórios.");
            return;
        }
        setIsSubmitting(true);
        setFormError(null);
        try {
            const token = await getToken();
            if (!token) throw new Error('Authentication token not available.');
            await createUser(newUsername, newPassword, newRole, token);
            setNewUsername('');
            setNewPassword('');
            setNewRole('user');
            await fetchUsers(); // Refresh the list
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Ocorreu um erro desconhecido.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="w-full flex justify-center p-16"><Spinner /></div>;
    }

    if (error) {
        return <div className="text-center text-red-600">{error}</div>;
    }

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-800 text-center">Gerenciamento de Usuários</h1>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* User List */}
                <div className="lg:col-span-2 bg-white/80 border border-gray-200 rounded-lg p-6 backdrop-blur-sm">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Usuários Existentes</h2>
                     <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Nome de Usuário</th>
                                    <th scope="col" className="px-6 py-3">Permissão</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(user => (
                                    <tr key={user.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{user.username}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                                {user.role === 'admin' ? 'Administrador' : 'Usuário'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Create User Form */}
                <div className="bg-white/80 border border-gray-200 rounded-lg p-6 backdrop-blur-sm self-start">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Criar Novo Usuário</h2>
                    <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Nome de Usuário</label>
                            <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700">Senha</label>
                            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Permissão</label>
                            <select value={newRole} onChange={e => setNewRole(e.target.value as UserRole)} className="mt-1 block w-full pl-3 pr-10 py-2 bg-white text-gray-900 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md">
                                <option value="user">Usuário</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        {formError && <p className="text-red-600 text-sm">{formError}</p>}
                        <button type="submit" disabled={isSubmitting} className="w-full mt-2 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400">
                            {isSubmitting ? 'Criando...' : 'Criar Usuário'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default UserManagementView;