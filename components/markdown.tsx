import { sanitize } from "isomorphic-dompurify";
import { marked } from "marked";

const renderer = new marked.Renderer();

// add captions to images
renderer.image = function ({href, title, text}) {
  const html = `<figure><img src="${href}" title="${title}" alt="${text}" /></figure>`;
  if (title) {
    return `<figure>
      ${html}
      <figcaption>${title}</figcaption>
      </figure>`;
  }
  return html;
};

const parseMarkdown = (content: string, options = {}): string => {
  return marked.parse(content, {
    renderer,
    breaks: true,
    ...options,
  }) as string;
};

const ALLOWED_TAGS = [
  "#text",
  "strong",
  "b",
  "em",
  "i",
  "blockquote",
  "q",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "table",
  "tr",
  "td",
  "ul",
  "ol",
  "li",
];

export default function Markdown({
  content,
  noLinks = false,
  ...props
}: {
  content: string;
  noLinks?: boolean;
}) {
  const html = sanitize(parseMarkdown(content), {
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} {...props} />;
}
