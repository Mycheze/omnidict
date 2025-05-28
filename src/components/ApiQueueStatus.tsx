'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, X, Minimize2, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useApiQueueStore, QueuedRequest } from '@/stores/apiQueueStore';

type QueueDisplayState = 'minimized' | 'normal' | 'expanded';

export function ApiQueueStatus() {
  const [displayState, setDisplayState] = useState<QueueDisplayState>('normal');
  const [isHovering, setIsHovering] = useState(false);
  const { queue, activeRequests, completedRequests, removeFromQueue, clearCompleted } = useApiQueueStore();

  const totalPending = queue.length;
  const totalActive = activeRequests.length;
  const recentCompleted = completedRequests.slice(0, 3);

  // Show if there's any current activity OR recent completed requests
  const hasActivity = totalPending > 0 || totalActive > 0;
  const hasRecentActivity = completedRequests.length > 0;
  
  if (!hasActivity && !hasRecentActivity) {
    return null;
  }

  // Auto-expand when there's active work (unless manually minimized)
  const autoExpanded = (totalActive > 0 || totalPending > 1) && displayState !== 'minimized';
  const shouldShowExpanded = displayState === 'expanded' || autoExpanded;
  const shouldShowMinimized = displayState === 'minimized';
  const shouldShowNormal = displayState === 'normal' && !autoExpanded;

  // Show larger view on hover when minimized
  const showOnHover = shouldShowMinimized && isHovering;

  const getRequestIcon = (request: QueuedRequest) => {
    switch (request.status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-muted-foreground" />;
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'error':
        return <XCircle className="h-3 w-3 text-red-500" />;
    }
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'create': return 'Creating';
      case 'regenerate': return 'Regenerating';
      case 'get': return 'Loading';
      case 'delete': return 'Deleting';
      case 'lemma': return 'Lemmatizing';
      default: return type;
    }
  };

  const formatElapsedTime = (startTime: number) => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    return elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  };

  const getStatusColor = () => {
    if (totalActive > 0) return 'bg-blue-500';
    if (totalPending > 0) return 'bg-orange-500';
    if (recentCompleted.some(r => r.status === 'error')) return 'bg-red-500';
    if (recentCompleted.length > 0) return 'bg-green-500';
    return 'bg-gray-400';
  };

  const getTotalCount = () => totalPending + totalActive;

  // Minimized view
  if (shouldShowMinimized && !showOnHover) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 cursor-pointer"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={() => setDisplayState('normal')}
      >
        <div className={`w-6 h-6 rounded-full ${getStatusColor()} flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110`}>
          {totalActive > 0 ? (
            <Loader2 className="h-3 w-3 animate-spin text-white" />
          ) : (
            <span className="text-white text-xs font-bold">
              {getTotalCount() || '✓'}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Hover preview when minimized
  if (showOnHover) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={() => setDisplayState('normal')}
      >
        <Card className="w-64 shadow-lg border-2 border-blue-500 transition-all duration-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              {totalActive > 0 && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              <span className="font-medium">
                {hasActivity ? `${getTotalCount()} requests` : 'Recent activity'}
              </span>
            </div>
            {activeRequests.slice(0, 2).map((request) => (
              <div key={request.id} className="flex items-center gap-2 mt-2 text-xs">
                {getRequestIcon(request)}
                <span className="truncate">
                  {getRequestTypeLabel(request.type)} "{request.word}"
                </span>
              </div>
            ))}
            <div className="text-xs text-muted-foreground mt-2">
              Click to restore
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Normal and Expanded views
  return (
    <Card className={`fixed bottom-4 right-4 w-80 z-50 shadow-lg transition-all duration-200 ${
      hasActivity ? 'border-blue-500 shadow-blue-200' : 'border'
    }`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            {totalActive > 0 && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {hasActivity ? (
              <span className="text-blue-600 font-semibold">Processing Requests</span>
            ) : (
              "Recent Requests"
            )}
            {totalPending + totalActive > 0 && (
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                {totalPending + totalActive}
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
            {completedRequests.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearCompleted}
                className="h-6 w-6 p-0"
                title="Clear completed"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisplayState('minimized')}
              className="h-6 w-6 p-0"
              title="Minimize"
            >
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDisplayState(shouldShowExpanded ? 'normal' : 'expanded')}
              className="h-6 w-6 p-0"
              disabled={autoExpanded}
              title={shouldShowExpanded ? 'Collapse' : 'Expand'}
            >
              {shouldShowExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Summary */}
        <div className="flex gap-4 text-xs mb-2">
          {totalActive > 0 && (
            <span className="text-blue-600 font-medium">
              Processing: {totalActive}
            </span>
          )}
          {totalPending > 0 && (
            <span className="text-orange-600 font-medium">
              Queued: {totalPending}
            </span>
          )}
          {!hasActivity && recentCompleted.length > 0 && (
            <span className="text-green-600 font-medium">
              Recent: {recentCompleted.length}
            </span>
          )}
        </div>

        {/* Current active requests (always visible in normal/expanded) */}
        {activeRequests.map((request) => (
          <div key={request.id} className="flex items-center gap-2 py-1 text-sm">
            {getRequestIcon(request)}
            <span className="flex-1 truncate">
              {getRequestTypeLabel(request.type)} "{request.word}"
            </span>
            <span className="text-xs text-muted-foreground">
              {formatElapsedTime(request.startTime)}
            </span>
          </div>
        ))}

        {/* Expanded view */}
        {shouldShowExpanded && (
          <div className="space-y-1 mt-2 max-h-40 overflow-y-auto">
            {/* Pending requests */}
            {queue.map((request) => (
              <div key={request.id} className="flex items-center gap-2 py-1 text-sm">
                {getRequestIcon(request)}
                <span className="flex-1 truncate">
                  {getRequestTypeLabel(request.type)} "{request.word}"
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFromQueue(request.id)}
                  className="h-5 w-5 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {/* Recent completed requests */}
            {recentCompleted.map((request) => (
              <div key={request.id} className="flex items-center gap-2 py-1 text-sm opacity-75">
                {getRequestIcon(request)}
                <span className="flex-1 truncate">
                  {getRequestTypeLabel(request.type)} "{request.word}"
                  {request.status === 'error' && request.error && (
                    <span className="text-red-500 text-xs ml-1">- {request.error}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatElapsedTime(request.startTime)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}