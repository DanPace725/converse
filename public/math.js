// Tokenize math before Markdown consumes backslashes/underscores. Code stays literal.
window.converseMath = {
  parse(text) {
    const formulas = [], prefix = crypto.randomUUID();
    const delimiters = [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
      ...['equation', 'equation*', 'align', 'align*', 'gather', 'gather*'].map(name => ({
        left: `\\begin{${name}}`, right: `\\end{${name}}`, display: true, environment: true,
      })),
    ];
    function token(source, block) {
      const leading = block ? source.match(/^[ \t]{0,3}/)[0] : '';
      const src = source.slice(leading.length);
      for (const delimiter of delimiters) {
        if (block && !delimiter.display) continue;
        if (!src.startsWith(delimiter.left)) continue;
        let end = delimiter.left.length;
        while ((end = src.indexOf(delimiter.right, end)) !== -1) {
          let escapes = 0;
          for (let i = end - 1; i >= 0 && src[i] === '\\'; i--) escapes++;
          if (escapes % 2 === 0) break;
          end += delimiter.right.length;
        }
        if (end === -1) continue;
        const body = src.slice(delimiter.left.length, end);
        if (!body.trim() || (delimiter.left === '$' && (/^\s|\s$|\n/.test(body)
          || body.includes('$$') || body.includes('`') || /^[\p{L}\p{N}$]/u.test(src.slice(end + 1))))) continue;
        let raw = leading + src.slice(0, end + delimiter.right.length);
        if (block) {
          const tail = source.slice(raw.length).match(/^[ \t]*(?:\n|$)/);
          if (!tail) continue;
          raw += tail[0];
        }
        return { type: block ? 'mathBlock' : 'mathInline', raw,
          text: delimiter.environment ? src.slice(0, end + delimiter.right.length) : body,
          display: delimiter.display };
      }
    }
    const renderer = item => {
      const key = prefix + '-' + formulas.length;
      formulas.push({ key, text: item.text, display: item.display });
      return `<span data-converse-math="${key}"></span>`;
    };
    const parser = new marked.Marked({ gfm: true, extensions: [
      { name: 'mathBlock', level: 'block', start: src => src.search(/(?:^|\n)[ \t]{0,3}(?:\$\$|\\\[|\\begin\{)/),
        tokenizer: src => token(src, true), renderer },
      { name: 'mathInline', level: 'inline', start: src => src.search(/\$|\\[([]|\\begin\{/),
        tokenizer: src => token(src, false), renderer },
    ] });
    return { html: parser.parse(text), formulas };
  },
  render(element, formulas) {
    for (const formula of formulas) {
      const span = element.querySelector(`[data-converse-math="${formula.key}"]`);
      if (!span) continue;
      if (!window.katex) { span.textContent = formula.text; continue; }
      katex.render(formula.text, span, { displayMode: formula.display, throwOnError: false,
        trust: false, strict: false, maxSize: 10, maxExpand: 1000, output: 'htmlAndMathml' });
      span.removeAttribute('data-converse-math');
    }
  },
};
