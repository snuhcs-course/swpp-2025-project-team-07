import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { MarkdownMessage } from './MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renders markdown content with custom components', () => {
    const { container } = render(
      <MarkdownMessage
        content={'# Heading\n\nThis is a [link](https://example.com) with `code`.'}
      />
    );

    const heading = container.querySelector('h1');
    const link = container.querySelector('a');
    const code = container.querySelector('code');

    expect(heading).toHaveTextContent('Heading');
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(code).toHaveTextContent('code');
  });

  it('renders lists, blockquotes, and code blocks with styling', () => {
    const { container } = render(
      <MarkdownMessage
        content={'- Item one\n- Item two\n\n> Block quote\n\n```ts\nconst value = 1;\n```'}
      />
    );

    const list = container.querySelector('ul');
    const items = container.querySelectorAll('li');
    const quote = container.querySelector('blockquote');
    const codeBlock = Array.from(container.querySelectorAll('code')).find((el) => el.textContent?.includes('const value'));

    expect(list).toBeInTheDocument();
    expect(items.length).toBe(2);
    expect(quote).toHaveTextContent('Block quote');
    expect(codeBlock).toHaveTextContent('const value = 1;');
  });

  it('renders emphasis, tables, and task lists', () => {
    const markdown = `| Name | Value |\n| --- | --- |\n| Foo | **Bold** |\n\n- [x] Done item\n- [ ] Pending item\n\n*Italic text*`;
    const { container } = render(<MarkdownMessage content={markdown} />);

    const table = container.querySelector('table');
    const bold = container.querySelector('strong');
    const italic = container.querySelector('em');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    expect(table).toBeInTheDocument();
    expect(bold).toHaveTextContent('Bold');
    expect(italic).toHaveTextContent('Italic text');
    expect(checkboxes.length).toBe(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });
});
