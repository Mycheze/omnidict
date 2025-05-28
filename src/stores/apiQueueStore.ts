import { create } from 'zustand';

export interface QueuedRequest {
  id: string;
  type: 'create' | 'regenerate' | 'get' | 'delete' | 'lemma';
  word: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  startTime: number;
  result?: any;
  error?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

interface ApiQueueState {
  queue: QueuedRequest[];
  activeRequests: QueuedRequest[];
  completedRequests: QueuedRequest[];
  
  // Actions
  addToQueue: (request: Omit<QueuedRequest, 'id' | 'status' | 'startTime'>) => string;
  startProcessing: (requestId: string) => void;
  completeRequest: (requestId: string, result: any) => void;
  errorRequest: (requestId: string, error: string) => void;
  removeFromQueue: (requestId: string) => void;
  clearCompleted: () => void;
  getRequestById: (requestId: string) => QueuedRequest | undefined;
}

export const useApiQueueStore = create<ApiQueueState>((set, get) => ({
  queue: [],
  activeRequests: [],
  completedRequests: [],

  addToQueue: (request) => {
    const id = `${request.type}_${request.word}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const queuedRequest: QueuedRequest = {
      ...request,
      id,
      status: 'pending',
      startTime: Date.now(),
    };

    console.log('Adding to queue:', queuedRequest);

    set((state) => ({
      queue: [...state.queue, queuedRequest],
    }));

    return id;
  },

  startProcessing: (requestId) => {
    console.log('Starting processing:', requestId);
    set((state) => {
      const request = state.queue.find(r => r.id === requestId);
      if (!request) return state;

      const updatedRequest = { ...request, status: 'processing' as const };
      
      return {
        queue: state.queue.filter(r => r.id !== requestId),
        activeRequests: [...state.activeRequests, updatedRequest],
      };
    });
  },

  completeRequest: (requestId, result) => {
    console.log('Completing request:', requestId, result);
    set((state) => {
      const request = state.activeRequests.find(r => r.id === requestId);
      if (!request) return state;

      const completedRequest = { 
        ...request, 
        status: 'completed' as const, 
        result 
      };

      return {
        activeRequests: state.activeRequests.filter(r => r.id !== requestId),
        completedRequests: [completedRequest, ...state.completedRequests.slice(0, 9)], // Keep last 10
      };
    });
  },

  errorRequest: (requestId, error) => {
    set((state) => {
      const request = state.activeRequests.find(r => r.id === requestId) || 
                     state.queue.find(r => r.id === requestId);
      if (!request) return state;

      const erroredRequest = { 
        ...request, 
        status: 'error' as const, 
        error 
      };

      return {
        queue: state.queue.filter(r => r.id !== requestId),
        activeRequests: state.activeRequests.filter(r => r.id !== requestId),
        completedRequests: [erroredRequest, ...state.completedRequests.slice(0, 9)],
      };
    });
  },

  removeFromQueue: (requestId) => {
    set((state) => ({
      queue: state.queue.filter(r => r.id !== requestId),
      activeRequests: state.activeRequests.filter(r => r.id !== requestId),
    }));
  },

  clearCompleted: () => {
    set({ completedRequests: [] });
  },

  getRequestById: (requestId) => {
    const state = get();
    return [...state.queue, ...state.activeRequests, ...state.completedRequests]
      .find(r => r.id === requestId);
  },
}));