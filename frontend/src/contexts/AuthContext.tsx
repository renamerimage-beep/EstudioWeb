import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, getIdToken } from 'firebase/auth';
import { auth } from '../services/firebase'; // Supondo que seu firebase.ts exporta o 'auth' do client SDK

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe; // Limpa o listener ao desmontar
  }, []);

  const getToken = async () => {
    if (!currentUser) return null;
    return await getIdToken(currentUser);
  };

  const value = {
    currentUser,
    loading,
    getToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
