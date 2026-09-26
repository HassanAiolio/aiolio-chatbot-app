import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components, type Options } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

function textOf(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function CodeBlock({ language, code, children }: { language: string; code: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-language">{language}</span>
        <button type="button" className="copy-code-btn" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    const codeNode = (node as HastNode | undefined)?.children?.find((c) => c.tagName === 'code');
    const classes = codeNode?.properties?.className;
    const list = Array.isArray(classes) ? classes.map(String) : [];
    const language = list.find((c) => c.startsWith('language-'))?.slice(9) ?? 'text';
    return (
      <CodeBlock language={language} code={textOf(codeNode).replace(/\n$/, '')}>
        {children}
      </CodeBlock>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
    );
  },
};

const remarkPlugins: Options['remarkPlugins'] = [remarkGfm];
const rehypePlugins: Options['rehypePlugins'] = [[rehypeHighlight, { detect: true }]];

/** Markdown with GFM (tables, task lists), syntax highlighting and copyable code blocks. Raw HTML is not rendered. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
