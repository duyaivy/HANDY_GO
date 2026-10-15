import { describe, expect, it, beforeEach } from 'vitest';
import {
  renderEmailTemplate,
  loadEmailTemplate,
  clearTemplateCache,
  DEFAULT_EMAIL_TEMPLATE_HTML,
} from './email-template.util.js';

describe('EmailTemplateUtil', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  it('should load fallback default template when file path cannot be resolved', () => {
    const template = loadEmailTemplate('non-existent-template-file.html');
    expect(template).toBe(DEFAULT_EMAIL_TEMPLATE_HTML);
  });

  it('should load template.html from disk if it exists', () => {
    const template = loadEmailTemplate('template.html');
    expect(template).toContain('{{title}}');
    expect(template).toContain('{{content}}');
  });

  it('should render template with overridden variables', () => {
    const html = renderEmailTemplate('template.html', {
      title: 'Xác thực tài khoản',
      description: 'Mô tả thử nghiệm',
      content: '<div>Mã OTP: 123456</div>',
      note: 'Hết hạn trong 10 phút',
      footer: 'Bảo mật tài khoản của bạn',
    });

    expect(html).toContain('Xác thực tài khoản');
    expect(html).toContain('Mô tả thử nghiệm');
    expect(html).toContain('Mã OTP: 123456');
    expect(html).toContain('Hết hạn trong 10 phút');
    expect(html).toContain('Bảo mật tài khoản của bạn');
    expect(html).not.toContain('{{title}}');
    expect(html).not.toContain('{{content}}');
  });

  it('should support direct HTML string rendering with custom variables', () => {
    const customHtml = '<h1>{{title}}</h1><p>{{orderId}}</p>';
    const rendered = renderEmailTemplate(
      customHtml,
      {
        title: 'Xác nhận đơn hàng',
        orderId: 'ORDER-999',
      },
      { isHtmlContent: true },
    );

    expect(rendered).toBe('<h1>Xác nhận đơn hàng</h1><p>ORDER-999</p>');
  });

  it('should replace missing optional variables with empty string rather than keeping brackets', () => {
    const customHtml = '<h1>{{title}}</h1><p>{{note}}</p>';
    const rendered = renderEmailTemplate(
      customHtml,
      {
        title: 'Chào mừng',
      },
      { isHtmlContent: true },
    );

    expect(rendered).toBe('<h1>Chào mừng</h1><p></p>');
  });
});
