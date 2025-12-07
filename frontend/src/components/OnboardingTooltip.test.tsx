import '@/test/mockUi';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TooltipRenderProps } from 'react-joyride';

import { OnboardingTooltip } from './OnboardingTooltip';

const createProps = (overrides: Partial<TooltipRenderProps> = {}): TooltipRenderProps =>
  ({
    index: 0,
    step: { title: 'Welcome', content: 'Getting started' } as TooltipRenderProps['step'],
    backProps: { onClick: vi.fn() },
    primaryProps: { onClick: vi.fn() },
    tooltipProps: { 'data-testid': 'tooltip-card' },
    isLastStep: false,
    skipProps: { onClick: vi.fn() },
    ...overrides,
  } as TooltipRenderProps);

describe('OnboardingTooltip', () => {
  it('renders initial step state and wires skip/back actions', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    const { backProps } = createProps();

    render(
      <OnboardingTooltip
        {...createProps({
          skipProps: { onClick: onSkip },
          backProps,
        })}
      />,
    );

    expect(screen.getByTestId('tooltip-card')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Getting started')).toBeInTheDocument();

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton.className).toContain('invisible');
    await user.click(screen.getByLabelText(/Close tour/i));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows finish state on last step and triggers handlers', async () => {
    const user = userEvent.setup();
    const onPrimary = vi.fn();
    const onBack = vi.fn();

    render(
      <OnboardingTooltip
        {...createProps({
          index: 2,
          isLastStep: true,
          step: { title: 'All set', content: 'Ready to go' } as TooltipRenderProps['step'],
          primaryProps: { onClick: onPrimary },
          backProps: { onClick: onBack },
        })}
      />,
    );

    const finishButton = screen.getByRole('button', { name: /Finish/i });
    expect(finishButton).toBeInTheDocument();
    await user.click(finishButton);
    expect(onPrimary).toHaveBeenCalledTimes(1);

    const backButton = screen.getByRole('button', { name: /Back/i });
    expect(backButton.className).not.toContain('invisible');
    await user.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
