/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useMemo } from 'react';
import { getAllCosts, type CostLog } from '../services/costService';
import { getGalleryItems, type GalleryFolder } from '../services/galleryService';
import { getAllUsers, type User } from '../services/userService';
// FIX: Add PhotoIcon to the import list.
import { CurrencyDollarIcon, MagnifyingGlassIcon, ChevronRightIcon, XMarkIcon, PhotoIcon } from './icons';
import Spinner from './Spinner';

interface CostData {
    totalCost: number;
    logs: CostLog[];
}

interface CostCenterProps {
    currentUser: User;
    getToken: () => Promise<string | null>;
}

const CostCenter: React.FC<CostCenterProps> = ({ currentUser, getToken }) => {
    const [costData, setCostData] = useState<Map<string, CostData>>(new Map());
    const [projects, setProjects] = useState<GalleryFolder[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>(''); // Empty string for "All"
    const [selectedUser, setSelectedUser] = useState<string>(currentUser.id);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    useEffect(() => {
        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const token = await getToken();
                if (!token) throw new Error('Authentication token not available.');
                
                const galleryItems = await getGalleryItems('root', currentUser.id, token);
                const folders = galleryItems.filter((item): item is GalleryFolder => item.type === 'folder');
                setProjects(folders);

                if (currentUser.role === 'admin') {
                    const userList = await getAllUsers(token);
                    setUsers(userList);
                    setSelectedUser(''); // Admin defaults to "All Users"
                }
            } catch (err) {
                 setError("Falha ao carregar dados iniciais.");
                 console.error(err);
            }
        };
        fetchInitialData();
    }, [currentUser, getToken]);
    
    useEffect(() => {
        const fetchCosts = async () => {
            setIsLoading(true);
            try {
                const filters: { projectId?: string, userId?: string } = {};
                if (selectedProject) filters.projectId = selectedProject;

                // If admin, use the selected user filter. Otherwise, always use current user's ID.
                if (currentUser.role === 'admin') {
                    if (selectedUser) filters.userId = selectedUser;
                } else {
                    filters.userId = currentUser.id;
                }
                
                const data = await getAllCosts(filters);
                setCostData(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Falha ao carregar dados de custo.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchCosts();
    }, [selectedProject, selectedUser, currentUser]);

    const filteredCostData = useMemo(() => {
        const dataArray = Array.from(costData.entries());
        if (!searchQuery.trim()) {
            return dataArray;
        }
        const lowercasedQuery = searchQuery.toLowerCase();
        return dataArray.filter(([imageName]) =>
            imageName.toLowerCase().includes(lowercasedQuery)
        );
    }, [costData, searchQuery]);

    const displayTotalCost = useMemo(() => {
        let total = 0;
        filteredCostData.forEach(([, data]) => {
            total += data.totalCost;
        });
        return total;
    }, [filteredCostData]);

    const toggleExpand = (imageName: string) => {
        setExpandedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(imageName)) {
                newSet.delete(imageName);
            } else {
                newSet.add(imageName);
            }
            return newSet;
        });
    };
    
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL', // Using BRL as a placeholder, though costs are modeled in USD
            minimumFractionDigits: 4,
        }).format(amount);
    };

    const getOperationName = (operation: string) => {
        const names: Record<string, string> = {
            'retouch': 'Retoque',
            'model': 'Geração de Modelo',
            'expand': 'Expansão de Imagem',
            'describe': 'Análise de Peça',
            // FIX: Add 'correction' and 'findDifferences' for quality control operations.
            'correction': 'Correção de Peça',
            'enhance': 'Aprimoramento',
            'training': 'Treinamento de IA',
            'findDifferences': 'Análise de Diferenças',
        };
        return names[operation] || operation;
    };


    if (isLoading && costData.size === 0) {
        return (
            <div className="w-full flex justify-center items-center p-16">
                <Spinner />
            </div>
        );
    }
    
    if (error) {
        return (
            <div className="text-center bg-red-100 border border-red-200 p-8 rounded-lg max-w-2xl mx-auto">
                <h2 className="text-2xl font-bold text-red-800">Ocorreu um Erro</h2>
                <p className="text-md text-red-700 mt-2">{error}</p>
            </div>
        );
    }

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col gap-6 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-800 text-center">Central de Custos</h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/80 border border-gray-200 rounded-lg p-6 flex items-center justify-between backdrop-blur-sm">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Custo Total (Estimado)</p>
                        <p className="text-3xl font-bold text-gray-800">{formatCurrency(displayTotalCost)}</p>
                    </div>
                    <CurrencyDollarIcon className="w-12 h-12 text-green-500" />
                </div>
                <div className="bg-white/80 border border-gray-200 rounded-lg p-6 flex items-center justify-between backdrop-blur-sm">
                    <div>
                        <p className="text-sm font-medium text-gray-500">Imagens Processadas</p>
                        <p className="text-3xl font-bold text-gray-800">{filteredCostData.length}</p>
                    </div>
                    <PhotoIcon className="w-12 h-12 text-blue-500" />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-grow">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nome do arquivo..."
                        className="w-full bg-white border border-gray-300 text-gray-800 rounded-lg py-3 pl-10 pr-10 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')} 
                            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                            aria-label="Limpar busca"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <select 
                    value={selectedProject}
                    onChange={e => setSelectedProject(e.target.value)}
                    className="w-full sm:w-auto bg-white border border-gray-300 text-gray-800 rounded-lg py-3 px-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                    <option value="">Todos os Projetos</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                 {currentUser.role === 'admin' && (
                    <select 
                        value={selectedUser}
                        onChange={e => setSelectedUser(e.target.value)}
                        className="w-full sm:w-auto bg-white border border-gray-300 text-gray-800 rounded-lg py-3 px-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        <option value="">Todos os Usuários</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                )}
            </div>
            
            <div className="bg-white/80 border border-gray-200 rounded-lg overflow-hidden backdrop-blur-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th scope="col" className="px-6 py-3 w-12"></th>
                                <th scope="col" className="px-6 py-3">Nome do Arquivo</th>
                                <th scope="col" className="px-6 py-3">Custo Total</th>
                                <th scope="col" className="px-6 py-3">Operações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCostData.length > 0 ? filteredCostData.map(([imageName, data]) => (
                                <React.Fragment key={imageName}>
                                    <tr 
                                        className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                                        onClick={() => toggleExpand(imageName)}
                                    >
                                        <td className="px-6 py-4">
                                            <ChevronRightIcon className={`w-5 h-5 text-gray-400 transition-transform ${expandedItems.has(imageName) ? 'rotate-90' : ''}`} />
                                        </td>
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                                            {imageName}
                                        </th>
                                        <td className="px-6 py-4 font-semibold text-gray-700">
                                            {formatCurrency(data.totalCost)}
                                        </td>
                                        <td className="px-6 py-4">
                                            {data.logs.length}
                                        </td>
                                    </tr>
                                    {expandedItems.has(imageName) && (
                                        <tr className="bg-gray-50">
                                            <td colSpan={4} className="p-0">
                                                <div className="p-4">
                                                    <h4 className="font-semibold text-gray-800 mb-2">Histórico de Operações</h4>
                                                    <table className="w-full text-xs text-left text-gray-600">
                                                        <thead className="text-[10px] text-gray-500 uppercase bg-gray-200">
                                                            <tr>
                                                                <th scope="col" className="px-3 py-2">Operação</th>
                                                                <th scope="col" className="px-3 py-2">Detalhes</th>
                                                                <th scope="col" className="px-3 py-2">Data</th>
                                                                <th scope="col" className="px-3 py-2 text-right">Custo</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {data.logs.map(log => (
                                                                <tr key={log.id} className="border-b bg-white">
                                                                    <td className="px-3 py-2 font-medium">{getOperationName(log.operation)}</td>
                                                                    <td className="px-3 py-2 text-gray-500 truncate max-w-xs" title={log.details}>{log.details || 'N/A'}</td>
                                                                    <td className="px-3 py-2">{new Date(log.timestamp).toLocaleString()}</td>
                                                                    <td className="px-3 py-2 text-right">{formatCurrency(log.cost)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="text-center py-8 text-gray-500">
                                        {searchQuery ? 'Nenhum resultado encontrado.' : 'Nenhum custo registrado para este projeto.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default CostCenter;