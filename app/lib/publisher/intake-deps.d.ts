declare module 'remark-parse' {
  const plugin: any;
  export default plugin;
}

declare module 'remark-frontmatter' {
  const plugin: any;
  export default plugin;
}

declare module 'remark-rehype' {
  const plugin: any;
  export default plugin;
}

declare module 'remark-lint-heading-increment' {
  const plugin: any;
  export default plugin;
}

declare module 'remark-lint-no-duplicate-headings' {
  const plugin: any;
  export default plugin;
}

declare module 'rehype-stringify' {
  const plugin: any;
  export default plugin;
}

declare module 'mdast' {
  export interface Root {
    type: string;
    children: any[];
  }

  export interface Heading {
    type: 'heading';
    depth: number;
    children: any[];
  }

  export interface Paragraph {
    type: 'paragraph';
    children: any[];
  }

  export interface List {
    type: 'list';
    children: any[];
  }

  export interface Blockquote {
    type: 'blockquote';
    children: any[];
  }

  export interface Code {
    type: 'code';
    value: string;
  }

  export interface Table {
    type: 'table';
    children: any[];
  }
}

declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string, options?: any);
    window: Window;
  }
}
