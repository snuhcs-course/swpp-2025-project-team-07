import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { Components } from 'react-markdown';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

export function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  // Custom component renderers for markdown elements
  const components: Components = {
    // Headings
    h1: ({ children, ...props }) => (
      <h1 className="text-2xl font-semibold mt-6 mb-4 text-primary" {...props}>{children}</h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="text-xl font-semibold mt-5 mb-3 text-primary" {...props}>{children}</h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="text-lg font-semibold mt-4 mb-2 text-primary" {...props}>{children}</h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 className="text-base font-semibold mt-3 mb-2 text-primary" {...props}>{children}</h4>
    ),
    h5: ({ children, ...props }) => (
      <h5 className="text-sm font-semibold mt-2 mb-1 text-primary" {...props}>{children}</h5>
    ),
    h6: ({ children, ...props }) => (
      <h6 className="text-sm font-semibold mt-2 mb-1 text-muted-foreground" {...props}>{children}</h6>
    ),

    // Paragraphs
    p: ({ children, ...props }) => (
      <p className="mb-4 last:mb-0 leading-relaxed text-primary" {...props}>{children}</p>
    ),

    // Links
    a: ({ node, ...props }) => (
      <a
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:text-primary/80 transition-colors font-medium"
        {...props}
      />
    ),

    // Lists
    ul: ({ children, ...props }) => (
      <ul className="list-disc mb-4 space-y-1 text-primary ml-6" {...props}>{children}</ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="list-decimal mb-4 space-y-1 text-primary ml-6" {...props}>{children}</ol>
    ),
    li: ({ children, ...props }) => (
      <li className="leading-relaxed ml-2" {...props}>{children}</li>
    ),

    // Code blocks and inline code
    code: ({ node, inline, className, children, ...props }: any) => {
      // Inline code doesn't have a language class and inline prop should be true
      const isInline = inline || !className;

      if (isInline) {
        return (
          <code
            className="px-1.5 py-0.5 rounded bg-muted text-primary font-mono text-sm inline-block"
            {...props}
          >
            {children}
          </code>
        );
      }

      // Block code
      return (
        <code
          className={`${className || ''} block rounded-lg bg-muted/80 p-4 overflow-x-auto text-sm font-mono`}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ children, ...props }) => (
      <pre className="mb-4 rounded-lg overflow-hidden border border-border" {...props}>
        {children}
      </pre>
    ),

    // Blockquotes
    blockquote: ({ children, ...props }) => (
      <blockquote className="border-l-4 border-primary/30 pl-4 py-2 mb-4 italic text-muted-foreground bg-muted/30 rounded-r" {...props}>
        {children}
      </blockquote>
    ),

    // Horizontal rules
    hr: ({ ...props }) => <hr className="my-6 border-border" {...props} />,

    // Tables
    table: ({ children, ...props }) => (
      <div className="mb-4 overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border" {...props}>{children}</table>
      </div>
    ),
    thead: ({ children, ...props }) => (
      <thead className="bg-muted/50" {...props}>{children}</thead>
    ),
    tbody: ({ children, ...props }) => (
      <tbody className="divide-y divide-border bg-card" {...props}>{children}</tbody>
    ),
    tr: ({ children, ...props }) => <tr {...props}>{children}</tr>,
    th: ({ children, ...props }) => (
      <th className="px-4 py-3 text-left text-sm font-semibold text-primary" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="px-4 py-3 text-sm text-primary" {...props}>{children}</td>
    ),

    // Strong and emphasis
    strong: ({ children, ...props }) => (
      <strong className="font-bold text-primary" {...props}>{children}</strong>
    ),
    em: ({ children, ...props }) => <em className="italic" {...props}>{children}</em>,

    // Strikethrough (from GFM)
    del: ({ children, ...props }) => (
      <del className="line-through text-muted-foreground" {...props}>{children}</del>
    ),

    // Task lists (from GFM)
    input: ({ node, ...props }: any) => (
      <input
        type="checkbox"
        disabled
        className="mr-2 align-middle"
        {...props}
      />
    ),
  };

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
