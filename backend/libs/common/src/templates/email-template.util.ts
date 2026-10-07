import fs from 'node:fs';
import path from 'node:path';

export interface EmailTemplateVariables {
  title: string;
  description?: string;
  content: string;
  note?: string;
  footer?: string;
  brandLogoText?: string;
  appName?: string;
  [key: string]: string | number | undefined;
}

export const DEFAULT_EMAIL_TEMPLATE_HTML = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; margin-bottom: 24px;">
    <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: bold; font-size: 20px; width: 48px; height: 48px; line-height: 48px; border-radius: 10px;">{{brandLogoText}}</div>
    <h2 style="color: #111827; margin-top: 12px; margin-bottom: 4px; font-size: 22px;">{{title}}</h2>
    <p style="color: #6b7280; font-size: 14px; margin: 0;">{{description}}</p>
  </div>
  <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
    {{content}}
  </div>
  <p style="color: #374151; font-size: 14px; line-height: 1.5; margin-bottom: 8px;">
    {{note}}
  </p>
  <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
    {{footer}}
  </p>
</div>
`.trim();

const templateCache = new Map<string, string>();

/**
 * Loads an HTML email template from the filesystem with memory caching.
 * Resolves relative to current module, workspace folders, or falls back to DEFAULT_EMAIL_TEMPLATE_HTML.
 */
export function loadEmailTemplate(templatePath?: string): string {
  if (templatePath && templateCache.has(templatePath)) {
    return templateCache.get(templatePath)!;
  }

  const candidatePaths: string[] = [];

  if (templatePath) {
    candidatePaths.push(templatePath);
    if (!path.isAbsolute(templatePath)) {
      candidatePaths.push(path.resolve(process.cwd(), templatePath));
    }
  }

  candidatePaths.push(
    path.resolve(process.cwd(), 'libs/common/src/templates/template.html'),
    path.resolve(process.cwd(), 'apps/auth-service/src/templates/template.html'),
  );

  candidatePaths.push(
    path.resolve(process.cwd(), 'apps/auth-service/src/templates/template.html'),
    path.resolve(process.cwd(), 'libs/common/src/templates/template.html'),
  );

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const content = fs.readFileSync(candidate, 'utf-8').replace(/\r\n/g, '\n').trim();
        if (templatePath) {
          templateCache.set(templatePath, content);
        }
        return content;
      } catch {
        // Continue searching
      }
    }
  }

  return DEFAULT_EMAIL_TEMPLATE_HTML;
}

/**
 * Renders an email template by substituting `{{variable}}` placeholders with provided values.
 *
 * @param templateOrPath - A template file name/path (e.g. 'template.html') or an HTML template string.
 * @param variables - Key-value map of variables to override.
 * @param options - Additional render options.
 */
export function renderEmailTemplate(
  templateOrPath: string,
  variables: EmailTemplateVariables,
  options?: { isHtmlContent?: boolean },
): string {
  let templateHtml: string;

  if (
    options?.isHtmlContent ||
    templateOrPath.includes('<div') ||
    templateOrPath.includes('<html')
  ) {
    templateHtml = templateOrPath;
  } else {
    templateHtml = loadEmailTemplate(templateOrPath);
  }

  const mergedVariables: Record<string, string> = {
    brandLogoText: 'HG',
    appName: 'HANDY GO',
    title: '',
    description: '',
    content: '',
    note: '',
    footer: '',
    ...Object.fromEntries(
      Object.entries(variables).map(([k, v]) => [
        k,
        v !== undefined && v !== null ? String(v) : '',
      ]),
    ),
  };

  return templateHtml
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
      return key in mergedVariables ? mergedVariables[key] : '';
    })
    .trim();
}

/**
 * Clears the template memory cache (useful for testing).
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}
