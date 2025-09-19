/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { getDb } from './db';

const COST_STORE_NAME = 'cost_logs';

// FIX: Add 'correction' and 'findDifferences' for quality control operations.
export type OperationType = 'retouch' | 'model' | 'expand' | 'describe' | 'enhance' | 'training' | 'correction' | 'findDifferences';

export interface CostLog {
    id?: number;
    imageName: string;
    operation: OperationType;
    cost: number;
    timestamp: number;
    details?: string;
    projectId: string;
    userId: string;
}

// Pricing based on Gemini API - https://ai.google.dev/gemini-api/docs/pricing
// Prices are in USD.
const PRICE_PER_INPUT_CHAR = 0.35 / 1_000_000;  // $0.35 per 1M characters for Gemini 1.5 Flash
const PRICE_PER_OUTPUT_CHAR = 0.70 / 1_000_000; // $0.70 per 1M characters for Gemini 1.5 Flash
const PRICE_PER_INPUT_IMAGE = 0.000125;         // $0.000125 per image for Gemini 1.5 Flash
const PRICE_PER_OUTPUT_IMAGE = 0.020;           // $0.020 per image generated (based on Imagen 2 as a proxy)

interface CostCalculationParams {
    operation: OperationType;
    inputChars?: number;
    outputChars?: number;
    inputImages?: number;
    outputImages?: number;
}


/**
 * Calculates a representative cost for an AI operation based on Gemini API pricing.
 * @param params An object detailing the inputs and outputs of the operation.
 * @returns A calculated cost as a number (USD).
 */
export const calculateCost = (params: CostCalculationParams): number => {
    let totalCost = 0;
    
    if (params.inputChars) {
        totalCost += params.inputChars * PRICE_PER_INPUT_CHAR;
    }
    if (params.outputChars) {
        totalCost += params.outputChars * PRICE_PER_OUTPUT_CHAR;
    }
    if (params.inputImages) {
        totalCost += params.inputImages * PRICE_PER_INPUT_IMAGE;
    }
    if (params.outputImages) {
        totalCost += params.outputImages * PRICE_PER_OUTPUT_IMAGE;
    }

    // Add a very small minimum charge to ensure even small operations are logged
    return Math.max(totalCost, 0.00001);
};


/**
 * Logs a cost record to the database.
 * @param imageName The name of the original image file.
 * @param operation The type of operation performed.
 * @param cost The calculated cost.
 * @param userId The ID of the user who incurred the cost.
 * @param details Optional details about the operation (e.g., prompt).
 * @param projectId The ID of the project/folder this cost is associated with.
 */
export const logCost = async (imageName: string, operation: OperationType, cost: number, userId: string, details?: string, projectId: string = 'root'): Promise<void> => {
    const db = await getDb();
    const transaction = db.transaction(COST_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(COST_STORE_NAME);
    
    const log: CostLog = {
        imageName,
        operation,
        cost,
        timestamp: Date.now(),
        details: details?.substring(0, 150), // Truncate long details
        projectId,
        userId,
    };
    
    store.add(log);

    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => {
            console.log(`Custo registrado para ${imageName} (usuário ${userId}) no projeto ${projectId}: ${operation} - ${cost}`);
            resolve();
        };
        transaction.onerror = (event) => reject(new Error(`Falha ao registrar custo: ${(event.target as IDBRequest).error}`));
    });
};

/**
 * Retrieves and aggregates all cost logs, with optional filtering.
 * @param filters An object containing optional projectId and/or userId to filter by.
 * @returns A Map where keys are image names and values are objects with total cost and a list of logs.
 */
export const getAllCosts = async (filters: { projectId?: string, userId?: string } = {}): Promise<Map<string, { totalCost: number, logs: CostLog[] }>> => {
    const db = await getDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(COST_STORE_NAME, 'readonly');
        const store = transaction.objectStore(COST_STORE_NAME);
        const request = store.getAll();

        request.onerror = () => reject(new Error('Falha ao obter os registros de custo.'));
        request.onsuccess = () => {
            let allLogs = request.result as CostLog[];

            // Apply filters
            if (filters.projectId) {
                allLogs = allLogs.filter(log => log.projectId === filters.projectId);
            }
            if (filters.userId) {
                allLogs = allLogs.filter(log => log.userId === filters.userId);
            }
            
            const costMap = new Map<string, { totalCost: number, logs: CostLog[] }>();

            // Newest first
            allLogs.sort((a, b) => b.timestamp - a.timestamp);

            for (const log of allLogs) {
                if (!costMap.has(log.imageName)) {
                    costMap.set(log.imageName, { totalCost: 0, logs: [] });
                }
                const entry = costMap.get(log.imageName)!;
                entry.totalCost += log.cost;
                entry.logs.push(log);
            }
            resolve(costMap);
        };
    });
};