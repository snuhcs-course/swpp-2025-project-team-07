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

  it('renders all heading levels (h2-h6)', () => {
    const markdown = `## Heading 2\n\n### Heading 3\n\n#### Heading 4\n\n##### Heading 5\n\n###### Heading 6`;
    const { container } = render(<MarkdownMessage content={markdown} />);

    const h2 = container.querySelector('h2');
    const h3 = container.querySelector('h3');
    const h4 = container.querySelector('h4');
    const h5 = container.querySelector('h5');
    const h6 = container.querySelector('h6');

    expect(h2).toHaveTextContent('Heading 2');
    expect(h3).toHaveTextContent('Heading 3');
    expect(h4).toHaveTextContent('Heading 4');
    expect(h5).toHaveTextContent('Heading 5');
    expect(h6).toHaveTextContent('Heading 6');
  });

  it('renders ordered lists and horizontal rules', () => {
    const markdown = `1. First item\n2. Second item\n3. Third item\n\n---\n\nAfter rule`;
    const { container } = render(<MarkdownMessage content={markdown} />);

    const ol = container.querySelector('ol');
    const items = container.querySelectorAll('ol li');
    const hr = container.querySelector('hr');

    expect(ol).toBeInTheDocument();
    expect(items.length).toBe(3);
    expect(items[0]).toHaveTextContent('First item');
    expect(items[1]).toHaveTextContent('Second item');
    expect(items[2]).toHaveTextContent('Third item');
    expect(hr).toBeInTheDocument();
  });

  it('renders strikethrough text', () => {
    const markdown = `This is ~~deleted text~~ with strikethrough.`;
    const { container } = render(<MarkdownMessage content={markdown} />);

    const del = container.querySelector('del');
    expect(del).toHaveTextContent('deleted text');
  });

  it('applies custom className', () => {
    const { container } = render(<MarkdownMessage content="Test" className="custom-class" />);
    const wrapper = container.querySelector('.prose');
    expect(wrapper).toHaveClass('custom-class');
  });
});
