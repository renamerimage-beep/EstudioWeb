/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../src/services/firebase'; // Assuming firebase.ts exports the initialized auth object
import { SparklesIcon } from './icons';
import Spinner from './Spinner';

// No longer needs onLoginSuccess as the AuthContext will handle the state change.
const Login: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged in AuthContext will handle the rest.
            // No need for onLoginSuccess.
        } catch (err) {
            if (err instanceof Error) {
                switch ((err as any).code) {
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                    case 'auth/invalid-credential':
                        setError("Email ou senha inválidos.");
                        break;
                    case 'auth/invalid-email':
                        setError("O formato do email é inválido.");
                        break;
                    default:
                        setError("Ocorreu um erro ao fazer login.");
                        break;
                }
            } else {
                setError("Ocorreu um erro desconhecido.");
            }
            setIsLoading(false);
        }
        // Don't set isLoading to false here on success, 
        // because the component will unmount.
    };

    const renderLoginForm = () => (
        <>
            <div className="flex items-center justify-center gap-3">
                <SparklesIcon className="w-8 h-8 text-blue-500" />
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Pixshop</h1>
            </div>
            <p className="text-center text-gray-600 mt-2">Faça login para continuar</p>
            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input 
                        type="email" 
                        value={email} 
                        onChange={e => setEmail(e.target.value)} 
                        required 
                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700">Senha</label>
                    <input 
                        type="password" 
                        value={password} 
                        onChange={e => setPassword(e.target.value)} 
                        required 
                        className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                </div>
                <button type="submit" disabled={isLoading} className="w-full mt-4 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 flex items-center justify-center gap-2">
                    {isLoading && <Spinner />}
                    Entrar
                </button>
            </form>
        </>
    );

    return (
        <div className="w-full max-w-md mx-auto bg-white/80 border border-gray-200 rounded-lg p-8 backdrop-blur-sm shadow-2xl animate-fade-in">
            {renderLoginForm()}
            {error && <p className="mt-4 text-center text-red-600 text-sm">{error}</p>}
        </div>
    );
};

export default Login;