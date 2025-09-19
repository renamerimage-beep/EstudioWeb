/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type UserRole = 'admin' | 'user';

// This is a placeholder type. The actual User type might have more fields.
// Based on its usage in CostCenter.tsx
export interface User {
  id: string;
  username: string;
  role: UserRole;
}

/**
 * Fetches all users from the backend.
 * Requires an admin authorization token.
 * @param token The Firebase auth token.
 * @returns A promise that resolves to an array of users.
 */
export const getAllUsers = async (token: string): Promise<User[]> => {
  const response = await fetch('/api/users', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to fetch users' }));
    throw new Error(errorData.message || 'Failed to fetch users');
  }

  return response.json();
};

/**
 * Creates a new user.
 * Requires an admin authorization token.
 * @param username The username for the new user.
 * @param password The password for the new user.
 * @param role The role for the new user.
 * @param token The Firebase auth token.
 * @returns A promise that resolves when the user is created.
 */
export const createUser = async (username: string, password: string, role: UserRole, token: string): Promise<void> => {
  const response = await fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ username, password, role }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Failed to create user' }));
    throw new Error(errorData.message || 'Failed to create user');
  }
};
