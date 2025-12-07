import { ChevronDown, CircleCheck } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import type { LLMProviderType } from '@/types/electron';

interface ModelSelectorProps {
  selectedModel: LLMProviderType;
  onSelectModel: (model: LLMProviderType) => void;
  disabled?: boolean;
}

const models = [
  {
    id: 'ollama' as const,
    name: 'Gemma 3',
    description: 'Private and secure',
  },
  {
    id: 'openai' as const,
    name: 'GPT 5',
    description: 'Intelligent and fast',
  },
];

export function ModelSelector({
  selectedModel,
  onSelectModel,
  disabled = false,
}: ModelSelectorProps) {
  const selectedModelInfo = models.find((m) => m.id === selectedModel) || models[0];

  const handleSelect = (modelId: LLMProviderType) => {
    if (disabled) return;
    onSelectModel(modelId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={`
            h-auto px-3 py-2 rounded-full gap-1.5
            text-muted-foreground ring-0 outline-none ring-ring-0
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-ring-0
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
        >
          <span className="text-xs font-medium">{selectedModelInfo.name}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 rounded-xl">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Select model
        </DropdownMenuLabel>

        {models.map((model) => {
          const isSelected = selectedModel === model.id;

          return (
            <DropdownMenuItem
              key={model.id}
              onClick={() => handleSelect(model.id)}
              className="flex items-center gap-3 p-3 cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${isSelected ? 'text-primary' : ''}`}>
                    {model.name}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {model.description}
                </p>
              </div>

              {isSelected && (
                <CircleCheck className="size-5 text-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
