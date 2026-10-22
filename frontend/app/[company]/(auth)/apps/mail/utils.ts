/**
 * Check if a string contains HTML tags
 */
export function isHTML(str: string): boolean {
  if (!str) return false;
  const htmlRegex = /<[a-z][\s\S]*>/i;
  return htmlRegex.test(str);
}

/**
 * Sanitize HTML content to prevent style leakage
 * Removes <style> tags and any CSS that could affect global elements
 */
export function sanitizeEmailHTML(html: string): string {
  if (!html) return '';
  
  let sanitized = html;
  
  // Remove all <style> tags completely (they can contain global CSS)
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Remove <link> tags that might load external stylesheets
  sanitized = sanitized.replace(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '');
  
  // Remove any CSS in <style> attributes (rare but possible)
  sanitized = sanitized.replace(/<[^>]*style\s*=\s*["'][^"']*["'][^>]*>/gi, (match) => {
    // Remove the style attribute but keep the tag
    return match.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');
  });
  
  return sanitized;
}

/**
 * Strip HTML tags from a string for preview purposes
 */
export function stripHTML(html: string, maxLength: number = 300): string {
  if (!html) return '';
  
  // If it's not HTML, just return truncated text
  if (!isHTML(html)) {
    return html.substring(0, maxLength);
  }
  
  // Remove HTML tags and decode entities
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove styles
    .replace(/<[^>]+>/g, ' ') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Decode &amp;
    .replace(/&lt;/g, '<') // Decode &lt;
    .replace(/&gt;/g, '>') // Decode &gt;
    .replace(/&quot;/g, '"') // Decode &quot;
    .replace(/&#39;/g, "'") // Decode &#39;
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
  
  return text.substring(0, maxLength);
}

