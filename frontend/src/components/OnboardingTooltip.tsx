import { TooltipRenderProps } from 'react-joyride';
import { Button } from './ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card } from './ui/card';

export function OnboardingTooltip({
  index,
  step,
  backProps,
  primaryProps,
  tooltipProps,
  isLastStep,
  size,
  skipProps,
}: TooltipRenderProps) {
  return (
    <Card
      {...tooltipProps}
      className="bg-[#27272a] text-white p-5 rounded-xl max-w-md shadow-2xl border border-zinc-700 flex flex-col gap-4 relative"
    >
      {step.title && (
        <h4 className="font-semibold text-lg pr-8">{step.title}</h4>
      )}
      <div className="text-zinc-100 leading-relaxed">
        {step.content}
      </div>
      
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-zinc-700/50">
        {/* Skip Button */}
        <Button
          {...skipProps}
          variant="ghost"
          size="sm"
          className={`text-zinc-300 hover:text-white hover:bg-zinc-700/50`}
        >
          <span className="text-xs font-medium">Skip</span>
        </Button>

        {/* Back Button */}
        <Button
          {...backProps}
          variant="ghost"
          size="sm"
          className={`text-zinc-300 hover:text-white hover:bg-zinc-700/50`}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Step Counter */}
        <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
          Step {index + 1} of {size}
        </span>

        {/* Next/Finish Button */}
        <Button
          {...primaryProps}
          variant="ghost"
          size="sm"
          className={`text-zinc-300 hover:text-white hover:bg-zinc-700/50`}
        >
          {isLastStep ? 'Finish' : 'Next'}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
}
