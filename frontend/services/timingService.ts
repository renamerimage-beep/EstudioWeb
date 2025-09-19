/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const TIMING_HISTORY_KEY = 'pixshop-timing-history';
const MAX_HISTORY_ENTRIES = 100; // Limita o tamanho do histórico

interface TimingRecord {
    key: string; // ex., "1024x1024"
    duration: number; // em milissegundos
    timestamp: number;
}

// Função para obter o histórico atual do localStorage
const getHistory = (): TimingRecord[] => {
    try {
        const stored = localStorage.getItem(TIMING_HISTORY_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Falha ao analisar o histórico de tempo:", error);
        return [];
    }
};

// Função para salvar o histórico no localStorage, com poda
const saveHistory = (history: TimingRecord[]) => {
    try {
        // Ordena por data e mantém apenas as entradas mais recentes
        const sortedAndPruned = history
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_HISTORY_ENTRIES);
        localStorage.setItem(TIMING_HISTORY_KEY, JSON.stringify(sortedAndPruned));
    } catch (error) {
        console.error("Falha ao salvar o histórico de tempo:", error);
    }
};

/**
 * Cria uma chave consistente a partir dos parâmetros da tarefa.
 * Atualmente, considera apenas as dimensões.
 * @param params Um objeto com os parâmetros da tarefa, ex., { width: number, height: number }
 * @returns Uma chave de string, ex., "1024x1024" ou "default"
 */
const createKeyFromParams = (params: { width?: number | string; height?: number | string }): string => {
    const width = parseInt(String(params.width || 0), 10);
    const height = parseInt(String(params.height || 0), 10);

    if (width > 0 && height > 0) {
        // Padroniza a ordem para tratar 1024x768 da mesma forma que 768x1024
        return [width, height].sort((a, b) => a - b).join('x');
    }
    return 'default';
};

/**
 * Registra o tempo de conclusão para um tipo específico de tarefa.
 * @param params Parâmetros da tarefa concluída.
 * @param duration O tempo que levou em milissegundos.
 */
export const recordCompletion = (params: { width?: number | string; height?: number | string }, duration: number) => {
    if (duration <= 0) return;
    const key = createKeyFromParams(params);
    const history = getHistory();
    const newRecord: TimingRecord = {
        key,
        duration,
        timestamp: Date.now(),
    };
    history.push(newRecord);
    saveHistory(history);
    console.log(`Tempo registrado para a chave '${key}': ${duration}ms`);
};

/**
 * Formata uma duração em milissegundos para uma string legível.
 * @param ms Duração em milissegundos.
 * @returns Uma string formatada como "~1 min 30 seg"
 */
export const formatDuration = (ms: number): string => {
    if (ms <= 0) return '';
    const totalSeconds = Math.round(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
        return `~${minutes} min ${seconds} seg`;
    }
    return `~${seconds} seg`;
};


/**
 * Estima o tempo de conclusão de uma tarefa com base em dados históricos.
 * @param params Parâmetros da tarefa a ser estimada.
 * @returns Uma duração estimada em milissegundos, ou um valor padrão.
 */
export const getEstimateMs = (params: { width?: number | string; height?: number | string }): number => {
    const key = createKeyFromParams(params);
    const history = getHistory();
    const relevantRecords = history.filter(record => record.key === key);

    if (relevantRecords.length > 0) {
        // Média simples dos últimos 5 registros para esta chave
        const recentRecords = relevantRecords.slice(0, 5);
        const average = recentRecords.reduce((sum, record) => sum + record.duration, 0) / recentRecords.length;
        return average;
    }
    
    // Estimativa padrão se não houver histórico para esta chave
    return key === 'default' ? 30000 : 90000; // 30s para padrão, 90s para tarefas com dimensões
};

/**
 * Obtém uma string de estimativa formatada e legível.
 * @param params Parâmetros da tarefa.
 * @returns Uma string formatada ou uma string vazia.
 */
export const getEstimateString = (params: { width?: number | string; height?: number | string }): string => {
    const ms = getEstimateMs(params);
    return formatDuration(ms);
};
