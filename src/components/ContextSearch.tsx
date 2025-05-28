'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronUp, X, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDictionaryStore } from '@/stores/dictionaryStore';

interface ContextSearchProps {
  onWordSelect: (word: string) => void;
  onContextualSearch: (word: string, context: string) => void;
  className?: string;
}

export function ContextSearch({ onWordSelect, onContextualSearch, className }: ContextSearchProps) {
  const {
    context,
    setContextSentence,
    setSelectedWord,
    setContextExpanded,
    clearContext,
    selectWordFromContext,
  } = useDictionaryStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Auto-focus when expanded
  useEffect(() => {
    if (context.isContextExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [context.isContextExpanded]);

  // Handle word selection from double-click
  const handleTextSelection = useCallback((e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = e.target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // If there's already a selection from the double-click, use it
    if (start !== end) {
      const selectedText = textarea.value.substring(start, end).trim();
      if (selectedText && selectedText.length > 0) {
        selectWordFromContext(selectedText, start, end);
        onWordSelect(selectedText);
        return;
      }
    }
    
    // Fallback: find word at cursor position
    const text = textarea.value;
    const clickPosition = start;
    
    // Find word boundaries using regex
    const wordRegex = /\b\w+\b/g;
    let match;
    
    while ((match = wordRegex.exec(text)) !== null) {
      if (clickPosition >= match.index && clickPosition <= match.index + match[0].length) {
        const selectedWord = match[0];
        selectWordFromContext(selectedWord, match.index, match.index + selectedWord.length);
        onWordSelect(selectedWord);
        
        // Highlight the selection in the textarea
        textarea.setSelectionRange(match.index, match.index + selectedWord.length);
        break;
      }
    }
  }, [selectWordFromContext, onWordSelect]);

  return (
    <Card className={`transition-all duration-200 ${context.isContextExpanded ? 'shadow-md' : 'shadow-sm'} ${className}`}>
      <CardHeader 
        className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setContextExpanded(!context.isContextExpanded)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span>Context-Aware Search</span>
            {context.isContextMode && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {context.contextSentence && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  clearContext();
                }}
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
            {context.isContextExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardTitle>
        {!context.isContextExpanded && context.contextSentence && (
          <p className="text-sm text-muted-foreground truncate mt-1">
            {context.contextSentence}
          </p>
        )}
      </CardHeader>

      {context.isContextExpanded && (
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Enter a sentence, then double-click on any word to search:
            </label>
            <textarea
              ref={textareaRef}
              value={context.contextSentence}
              onChange={(e) => setContextSentence(e.target.value)}
              onDoubleClick={handleTextSelection}
              placeholder="Type or paste a sentence here, then double-click on any word to define it..."
              className="w-full p-3 border rounded-md min-h-[80px] max-h-[200px] resize-y bg-background"
            />
            
            {context.selectedWord && (
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-md border border-blue-200">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-blue-600" />
                  <span className="text-sm">
                    Selected word: <strong className="text-blue-700">{context.selectedWord}</strong>
                  </span>
                </div>
                <Button
                  onClick={() => onContextualSearch(context.selectedWord, context.contextSentence)}
                  disabled={!context.contextSentence.trim()}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Search with Context
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              💡 Tip: Double-click words to select them, then click "Search with Context"
            </div>
            {context.contextSentence && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearContext}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}