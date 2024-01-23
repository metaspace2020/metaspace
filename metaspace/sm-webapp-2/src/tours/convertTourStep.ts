
interface FrontMatterMarkdownObject {
  attributes: any;
  body: string;
  html: string;
}

/**
 * Converts a Front-Matter based tour step into the format expected by the TourStep. This operates on the
 * exported object from a markdown file when `require`d with the "frontmatter-markdown-loader" webkit loader
 */
const convertTourStep = (step: FrontMatterMarkdownObject) => {
  return {
    ...step.attributes,
    content: step.html,
  }
}

export default convertTourStep
